import { proxyShareRequest } from '$lib/server/share-proxy.js';
import type { RequestHandler } from './$types.js';

/** Same-origin proxy for `GET /api/v1/share/{slug}/card.png` (Task 8) — the URL `$lib/og.ts`
 * already emits as `og:image`, previously 404ing because nothing on the web server answered it. */
export const GET: RequestHandler = async ({ params, request }) => {
  return proxyShareRequest(request, `/api/v1/share/${encodeURIComponent(params.slug)}/card.png`);
};
