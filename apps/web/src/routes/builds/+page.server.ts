import { listBuilds } from '$lib/server/api.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
  const builds = await listBuilds();
  return { builds };
};
