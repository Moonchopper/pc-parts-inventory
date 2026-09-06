import { API_BASE_URL } from './api.js';

/**
 * Task 8 (architect-directed, 2026-09-05) — `apps/web` proxies `GET /api/v1/share/*` same-origin,
 * server-side. `og:image`/`og:url` (`$lib/og.ts`) already point at the *web* origin
 * (`http://<web-host>/api/v1/share/{slug}/card.png`), because the web origin is the one public
 * origin and exposing the API's port directly would be the wrong shape even where it's reachable.
 * Without this proxy that URL 404s on the web server (nothing served `/api/v1/*` there), so an
 * unfurl (Discord, etc.) silently fails despite every gate being green — this generalises the
 * markdown-only proxy W0.4 shipped (`b/[slug]/markdown/+server.ts`, now folded into this one) to
 * cover the JSON route, `.md` and `/card.png` alike.
 *
 * Streams the upstream body through untouched (`Response(upstream.body, …)`) rather than buffering
 * via `.text()` — required for `/card.png`, whose bytes are binary; `.text()` would corrupt them.
 * Forwards `If-None-Match` upstream and passes a 304 straight back with no body, so W0.5's ETag
 * caching keeps working through the proxy. Passes the upstream status straight through, so a
 * `private` build still 404s here instead of surfacing as a 500.
 */
const FORWARD_REQUEST_HEADERS = ['if-none-match'] as const;
const FORWARD_RESPONSE_HEADERS = ['content-type', 'etag', 'cache-control'] as const;

export async function proxyShareRequest(request: Request, upstreamPath: string): Promise<Response> {
  const requestHeaders: Record<string, string> = {};
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) requestHeaders[name] = value;
  }

  const upstream = await fetch(`${API_BASE_URL}${upstreamPath}`, { headers: requestHeaders });

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  if (upstream.status === 304) {
    return new Response(null, { status: 304, headers: responseHeaders });
  }

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
