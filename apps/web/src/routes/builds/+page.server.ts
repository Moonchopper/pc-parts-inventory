import { listBuilds, rethrowApiUnreachable } from '$lib/server/api.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  try {
    const builds = await listBuilds();
    return { builds };
  } catch (err) {
    // F2 — same rule as the share page: an unreachable API 503s through `+error.svelte` instead of
    // hanging or crashing.
    rethrowApiUnreachable(err);
  }
};
