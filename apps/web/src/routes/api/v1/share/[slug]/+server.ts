import { proxyShareRequest } from '$lib/server/share-proxy.js';
import type { RequestHandler } from './$types.js';

const MD_SUFFIX = '.md';

/**
 * Same-origin proxy for `GET /api/v1/share/{slug}` (JSON) and `GET /api/v1/share/{slug}.md`
 * (Task 8) — mirrors the API's own routing trick (`apps/api/src/share/routes.ts`) of treating the
 * `.md` suffix as part of the `slug` path segment rather than a distinct nested route, since
 * SvelteKit's router has no built-in way to match "this dynamic segment, optionally suffixed".
 */
export const GET: RequestHandler = async ({ params, request }) => {
  const raw = params.slug;
  if (raw.endsWith(MD_SUFFIX)) {
    const slug = raw.slice(0, -MD_SUFFIX.length);
    return proxyShareRequest(request, `/api/v1/share/${encodeURIComponent(slug)}.md`);
  }
  return proxyShareRequest(request, `/api/v1/share/${encodeURIComponent(raw)}`);
};
