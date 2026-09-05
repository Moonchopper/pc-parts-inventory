import type { Valuation } from '@pcpi/contracts';

export type PartPricing = {
  currency: string;
  acquiredCents?: number;
  currentCents?: number;
};

/**
 * Task 2 (2026-09-05 polish brief) — joins each build's already-computed `GET
 * /builds/{id}/valuation` (§4, D5 precedence resolved server-side) onto parts by `partId`. One
 * lookup per part, no client-side pricing logic: the inventory table is not allowed to duplicate
 * D5's `used_market > new_retail > msrp` precedence, so it consumes the server's answer verbatim.
 *
 * Bounded request shape: the caller fetches one valuation per *build* (not per part) and passes
 * all of them here — a part that is in no build (or whose build's valuation fetch 404s) is simply
 * absent from every `valuation.items` array and therefore absent from the returned index, so the
 * inventory page renders it as `—` rather than inventing a price (the honest limit the brief
 * requires: valuation is build-scoped).
 */
export function indexValuationsByPart(
  valuations: readonly (Valuation | null)[],
): Record<string, PartPricing> {
  const index: Record<string, PartPricing> = {};
  for (const valuation of valuations) {
    if (!valuation) continue;
    for (const item of valuation.items) {
      index[item.partId] = {
        currency: valuation.currency,
        ...(item.acquiredCents != null ? { acquiredCents: item.acquiredCents } : {}),
        ...(item.currentCents != null ? { currentCents: item.currentCents } : {}),
      };
    }
  }
  return index;
}
