import { API_BASE_URL } from '$lib/server/api.js';
import type { RequestHandler } from './$types.js';

/**
 * Thin same-origin proxy for `GET /api/v1/share/{slug}.md` (W0.5; may 404 on this branch — Recon
 * #5). Needed because `API_URL` is server-only (Recon #3) and the two containers are on different
 * origins (D13) with no CORS story between them, so the share page's "copy Markdown" button (and
 * its no-JS `<a href>` fallback) cannot call the API directly from the browser. Passes the upstream
 * status/body straight through — no markdown generation happens here, that stays W0.5's.
 */
export const GET: RequestHandler = async ({ params }) => {
  const upstream = await fetch(
    `${API_BASE_URL}/api/v1/share/${encodeURIComponent(params.slug)}.md`,
  );
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/plain; charset=utf-8',
    },
  });
};
