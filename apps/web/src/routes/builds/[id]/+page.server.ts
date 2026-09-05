import { error, fail } from '@sveltejs/kit';
import {
  ApiRequestError,
  addBuildItem,
  getBuild,
  getValuation,
  listParts,
  removeBuildItem,
  rethrowApiUnreachable,
} from '$lib/server/api.js';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
  try {
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
  } catch (err) {
    // F2 — same rule as the share page: an unreachable API 503s through `+error.svelte` instead of
    // hanging or crashing; anything else (including the `error(404, …)` above) is rethrown as-is.
    rethrowApiUnreachable(err);
  }
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
      // Task 5.1 (2026-09-05 polish brief): surface the real upstream status — in particular the
      // 409 "part already in another build" conflict — rather than a blanket 502, which reads as
      // a server outage instead of "you can't do that, here's why" (the message was already
      // readable via `messageFor`; only the status code was wrong).
      const status = err instanceof ApiRequestError ? err.status : 502;
      return fail(status, { message: messageFor(err, 'Failed to add part to build.') });
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
      const status = err instanceof ApiRequestError ? err.status : 502;
      return fail(status, { message: messageFor(err, 'Failed to remove part from build.') });
    }
    return { success: true };
  },
};
