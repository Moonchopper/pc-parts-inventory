import type { SharedBuild, SharedBuildItem } from '@pcpi/contracts';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { buildItems, builds, parts, products } from '../db/schema.js';

/**
 * Loads the §4 `SharedBuild` for a slug, or `undefined` when the build does not exist or is
 * `private` — the one guard all three `/share/*` routes (JSON, `.md`, `/card.png`) apply.
 *
 * Extracted verbatim from the W0.1 JSON handler (no behavior change) so the Markdown and PNG
 * exports never diverge from what `GET /share/{slug}` returns — one query, one aggregation rule
 * (PCPartPicker-style: one row per product, `quantity` counts the parts), reused by all three.
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

  const byProduct = new Map<string, SharedBuildItem>();
  for (const { part, product } of rows) {
    const existing = byProduct.get(product.id);
    if (existing) {
      existing.quantity += part.quantity;
    } else {
      byProduct.set(product.id, {
        category: product.category,
        manufacturer: product.manufacturer,
        model: product.model,
        quantity: part.quantity,
      });
    }
  }

  return {
    slug: build.slug,
    name: build.name,
    ...(build.description != null ? { description: build.description } : {}),
    updatedAt: build.updatedAt,
    items: [...byProduct.values()],
  };
}
