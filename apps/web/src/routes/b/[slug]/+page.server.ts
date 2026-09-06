import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { buildOgImageUrl, buildOgTags, buildShareUrl, resolveOrigin } from '$lib/og.js';
import { getSharedBuild, rethrowApiUnreachable } from '$lib/server/api.js';
import type { PageServerLoad } from './$types.js';

function summarize(build: NonNullable<Awaited<ReturnType<typeof getSharedBuild>>>): string {
  if (build.description) return build.description;
  const itemCount = build.items.reduce((sum, item) => sum + item.quantity, 0);
  return `${itemCount} part${itemCount === 1 ? '' : 's'} — shared from PC Parts Inventory`;
}

/**
 * D7 / Recon #2 — SSR-only load; nothing here depends on client JS. A private or unknown slug 404s
 * on the API (`/api/v1/share/{slug}` — the seed's leak check already confirmed the response carries
 * no serials/notes/acquiredSource/owner data) and this `error(404, …)` renders SvelteKit's own 404
 * page, never a stack trace.
 */
export const load: PageServerLoad = async ({ params, url }) => {
  try {
    const build = await getSharedBuild(params.slug);
    if (!build) {
      error(404, `Build ${params.slug} not found`);
    }

    const origin = resolveOrigin(url.origin, env.PUBLIC_ORIGIN);
    const description = summarize(build);
    const ogTags = buildOgTags({
      title: build.name,
      description,
      // Recon #4 — W0.5's card.png route may 404 in this worktree; the tag is still emitted pointing
      // at the right (eventually reachable) absolute URL.
      imageUrl: buildOgImageUrl(origin, build.slug),
      pageUrl: buildShareUrl(origin, build.slug),
    });

    return { build, description, ogTags };
  } catch (err) {
    // F2 — an unreachable API must 503 through `+error.svelte` with a readable message, never hang
    // or show a stack trace; anything else (including the `error(404, …)` above) is rethrown as-is.
    rethrowApiUnreachable(err);
  }
};
