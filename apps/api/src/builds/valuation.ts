import type { Valuation } from '@pcpi/contracts';
import type { ValuateItemInput, ValuateQuoteInput } from '@pcpi/core';
import { valuate } from '@pcpi/core';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { buildItems, parts, priceQuotes, products } from '../db/schema.js';

/**
 * v1: every owner's currency is USD (D6's default) — the one place this is decided, so
 * `Valuation.currency`, `SharedBuild.currency` and every renderer that reads either agree by
 * construction instead of three independent `'USD'`/`$` guesses (brief: currency polish, Task 1).
 * A later ADR that adds a per-owner currency column only has to change this function.
 */
export function resolveCurrency(_ownerId: string): string {
  return 'USD';
}

/** D5 — every quote ever recorded for this product; `valuate()` itself picks the precedence winner and the latest-within-kind. */
function loadQuotesForProduct(productId: string): ValuateQuoteInput[] {
  return getDb()
    .select()
    .from(priceQuotes)
    .where(eq(priceQuotes.productId, productId))
    .all()
    .map((q) => ({
      kind: q.kind,
      priceCents: q.priceCents,
      currency: q.currency,
      observedAt: q.observedAt,
      provider: q.provider,
    }));
}

/**
 * D5 valuation for one build — the single code path both `GET /builds/{id}/valuation` and the
 * share route's population (brief Task 4) call directly (never the HTTP endpoint), so the two can
 * never compute or report it differently.
 */
export function computeValuation(buildId: string, ownerId: string): Valuation {
  const rows = getDb()
    .select({ part: parts, product: products })
    .from(buildItems)
    .innerJoin(parts, eq(buildItems.partId, parts.id))
    .innerJoin(products, eq(parts.productId, products.id))
    .where(eq(buildItems.buildId, buildId))
    .all();

  const items: ValuateItemInput[] = rows.map(({ part, product }) => ({
    partId: part.id,
    quantity: part.quantity,
    acquiredCents: part.acquiredPriceCents,
    quotes: loadQuotesForProduct(product.id),
  }));

  return valuate({ buildId, currency: resolveCurrency(ownerId), items });
}
