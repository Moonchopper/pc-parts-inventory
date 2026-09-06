import type { SharedBuild, SharedBuildItem } from '@pcpi/contracts';
import { compareByCategoryOrder } from '@pcpi/contracts';
import { eq } from 'drizzle-orm';
import { computeValuation, resolveCurrency } from '../builds/valuation.js';
import { getDb } from '../db/client.js';
import { buildItems, builds, parts, products } from '../db/schema.js';

const orderSharedItems = compareByCategoryOrder<SharedBuildItem>((item) => item);

/**
 * Loads the §4 `SharedBuild` for a slug, or `undefined` when the build does not exist or is
 * `private` — the one guard all three `/share/*` routes (JSON, `.md`, `/card.png`) apply.
 *
 * Extracted verbatim from the W0.1 JSON handler (no behavior change) so the Markdown and PNG
 * exports never diverge from what `GET /share/{slug}` returns — one query, one aggregation rule
 * (PCPartPicker-style: one row per product, `quantity` counts the parts), reused by all three.
 *
 * Task 4 (headline outcome, 2026-09-05): `valuation` and `items[].currentCents` are populated here
 * by calling `computeValuation` — the exact function `GET /builds/{id}/valuation` calls — directly,
 * never that HTTP endpoint. Per-part `currentCents` from the valuation is summed onto the
 * product-aggregated `SharedBuildItem` the same way `quantity` already is.
 */
export function loadSharedBuild(slug: string): SharedBuild | undefined {
  const db = getDb();
  const build = db.select().from(builds).where(eq(builds.slug, slug)).get();
  if (!build || build.visibility === 'private') {
    return undefined;
  }

  const rows = db
    .select({ item: buildItems, part: parts, product: products })
    .from(buildItems)
    .innerJoin(parts, eq(buildItems.partId, parts.id))
    .innerJoin(products, eq(parts.productId, products.id))
    .where(eq(buildItems.buildId, build.id))
    .all();

  const valuation = computeValuation(build.id, build.ownerId);
  const currentByPart = new Map(valuation.items.map((item) => [item.partId, item.currentCents]));

  const byProduct = new Map<string, SharedBuildItem>();
  for (const { part, product } of rows) {
    const partCurrent = currentByPart.get(part.id);
    const existing = byProduct.get(product.id);
    if (existing) {
      existing.quantity += part.quantity;
      if (partCurrent != null) {
        existing.currentCents = (existing.currentCents ?? 0) + partCurrent;
      }
    } else {
      byProduct.set(product.id, {
        category: product.category,
        manufacturer: product.manufacturer,
        model: product.model,
        quantity: part.quantity,
        ...(partCurrent != null ? { currentCents: partCurrent } : {}),
      });
    }
  }

  const items = [...byProduct.values()].sort(orderSharedItems);

  return {
    slug: build.slug,
    name: build.name,
    ...(build.description != null ? { description: build.description } : {}),
    updatedAt: build.updatedAt,
    currency: resolveCurrency(build.ownerId),
    items,
    valuation: {
      acquiredCents: valuation.acquiredCents,
      currentCents: valuation.currentCents,
      comparable: valuation.comparable,
      coverage: valuation.coverage,
    },
  };
}
