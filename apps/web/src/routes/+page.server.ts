import { listParts } from '$lib/server/api.js';
import type { PageServerLoad } from './$types.js';

/**
 * `/` — inventory. Deliberately does not compute a "current" price / delta per part: `GET
 * /products/{id}/quotes` and `GET /builds/{id}/valuation` (the only two sources of current pricing,
 * §5) are not implemented on this branch yet (W0.3, running in parallel — Recon #5), and even once
 * they land, resolving D5's `used_market > new_retail > msrp` precedence per row here would
 * duplicate server-side business logic in a client that is supposed to be "just" an API client
 * (D2). The columns are still shown, reading "—", so the table shape matches the brief and starts
 * showing real numbers once a build-scoped valuation (or a per-part price endpoint) exists to join
 * against without re-deriving pricing rules in the web layer.
 */
export const load: PageServerLoad = async () => {
  const parts = await listParts();
  return { parts };
};
