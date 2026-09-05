import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { SharedBuildItem } from '@pcpi/contracts';
import { ApiError, SharedBuild } from '@pcpi/contracts';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { buildItems, builds, parts, products } from '../db/schema.js';
import { validationHook } from '../openapi-hook.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

// `.md` (W0.5) and `/card.png` (W0.5) variants are added to this same file/router.
routes.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: SharedBuild } },
        description:
          'Shared build (JSON) — never includes serials, notes, acquiredSource or owner data',
      },
      404: {
        content: { 'application/json': { schema: ApiError } },
        description: 'Not found or private',
      },
    },
  }),
  (c) => {
    const { slug } = c.req.valid('param');
    const db = getDb();
    const build = db.select().from(builds).where(eq(builds.slug, slug)).get();
    if (!build || build.visibility === 'private') {
      const body: ApiError = { error: { code: 'not_found', message: `Build ${slug} not found` } };
      return c.json(body, 404);
    }

    const rows = db
      .select({ item: buildItems, part: parts, product: products })
      .from(buildItems)
      .innerJoin(parts, eq(buildItems.partId, parts.id))
      .innerJoin(products, eq(parts.productId, products.id))
      .where(eq(buildItems.buildId, build.id))
      .all();

    // Aggregate by product (PCPartPicker-style: one row per product, `quantity` counts the parts).
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

    const shared: SharedBuild = {
      slug: build.slug,
      name: build.name,
      ...(build.description != null ? { description: build.description } : {}),
      updatedAt: build.updatedAt,
      items: [...byProduct.values()],
    };
    return c.json(shared, 200);
  },
);
