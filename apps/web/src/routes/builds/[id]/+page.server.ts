import { error, fail } from '@sveltejs/kit';
import {
  ApiRequestError,
  addBuildItem,
  getBuild,
  getValuation,
  listParts,
  removeBuildItem,
} from '$lib/server/api.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
  const build = await getBuild(params.id);
  if (!build) {
    error(404, `Build ${params.id} not found`);
  }

  const [allParts, valuation] = await Promise.all([
    listParts(),
    // §5's `GET /builds/{id}/valuation` may not exist on this branch yet (Recon #5) — degrade to
    // "valuation unavailable" rather than fail the whole page.
    getValuation(params.id),
  ]);

  const inBuildIds = new Set((build.items ?? []).map((item) => item.partId));
  const availableParts = allParts.filter(
    (part) => part.status === 'on_shelf' && !inBuildIds.has(part.id),
  );

  return { build, availableParts, valuation };
};

function messageFor(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}

export const actions: Actions = {
  addItem: async ({ request, params }) => {
    const formData = await request.formData();
    const partId = formData.get('partId');
    const slot = formData.get('slot');
    if (typeof partId !== 'string' || partId.length === 0) {
      return fail(400, { message: 'Choose a part to add.' });
    }
    try {
      await addBuildItem(params.id, partId, typeof slot === 'string' && slot ? slot : undefined);
    } catch (err) {
      return fail(502, { message: messageFor(err, 'Failed to add part to build.') });
    }
    return { success: true };
  },

  removeItem: async ({ request, params }) => {
    const formData = await request.formData();
    const partId = formData.get('partId');
    if (typeof partId !== 'string' || partId.length === 0) {
      return fail(400, { message: 'Missing part id.' });
    }
    try {
      await removeBuildItem(params.id, partId);
    } catch (err) {
      return fail(502, { message: messageFor(err, 'Failed to remove part from build.') });
    }
    return { success: true };
  },
};
