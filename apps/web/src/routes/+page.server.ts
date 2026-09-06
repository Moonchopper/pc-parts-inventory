import { fail } from '@sveltejs/kit';
import { indexValuationsByPart } from '$lib/inventory-pricing.js';
import {
  ApiRequestError,
  getValuation,
  listBuilds,
  listParts,
  patchPart,
  rethrowApiUnreachable,
} from '$lib/server/api.js';
import type { Actions, PageServerLoad } from './$types.js';

/**
 * `/` — inventory. Task 2 (2026-09-05 polish brief): `current`/`delta` are now populated from
 * `GET /builds/{id}/valuation` (D5 precedence resolved server-side, §4) for parts that are in a
 * build. A part in no build has no valuation row at all — those rows correctly keep rendering `—`,
 * never an invented price (the honest limit the brief names).
 *
 * Bounded requests: one `listBuilds()` call plus one `getValuation()` per *build*, never per part —
 * `indexValuationsByPart` (a pure, unit-tested join, `$lib/inventory-pricing.ts`) then does one map
 * lookup per part instead of a request each.
 */
export const load: PageServerLoad = async () => {
  try {
    const [parts, builds] = await Promise.all([listParts(), listBuilds()]);
    const valuations = await Promise.all(builds.map((build) => getValuation(build.id)));
    const pricing = indexValuationsByPart(valuations);
    return { parts, pricing };
  } catch (err) {
    // F2 — same rule as the share page: an unreachable API 503s through `+error.svelte` instead of
    // hanging or crashing.
    rethrowApiUnreachable(err);
  }
};

function messageFor(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}

export const actions: Actions = {
  /** Task 5.2 — inline "acquired price" edit, no JS required. Integer cents on the wire (D6): the
   * form takes a plain integer number of cents directly, sidestepping any float/locale parsing of
   * a dollar amount. */
  updateAcquiredPrice: async ({ request }) => {
    const formData = await request.formData();
    const partId = formData.get('partId');
    const raw = formData.get('acquiredPriceCents');
    if (typeof partId !== 'string' || partId.length === 0) {
      return fail(400, { message: 'Missing part id.' });
    }
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return fail(400, { message: 'Enter an acquired price in cents.' });
    }
    const acquiredPriceCents = Number(raw);
    if (!Number.isInteger(acquiredPriceCents) || acquiredPriceCents < 0) {
      return fail(400, {
        message: 'Acquired price must be a whole, non-negative number of cents.',
      });
    }
    try {
      await patchPart(partId, { acquiredPriceCents });
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 502;
      return fail(status, { message: messageFor(err, 'Failed to update acquired price.') });
    }
    return { success: true };
  },
};
