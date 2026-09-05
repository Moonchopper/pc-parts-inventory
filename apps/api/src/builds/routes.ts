import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { BuildItemExpanded } from '@pcpi/contracts';
import { ApiError, Build, Valuation } from '@pcpi/contracts';
import type { ValuateItemInput, ValuateQuoteInput } from '@pcpi/core';
import { valuate } from '@pcpi/core';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { buildItems, builds, parts, priceQuotes, products } from '../db/schema.js';
import { LOCAL_OWNER_ID } from '../db/seed.js';
import { toBuildDTO, toPartDTO, toProductDTO } from '../dto.js';
import { validationHook } from '../openapi-hook.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

function loadItems(buildId: string): BuildItemExpanded[] {
  const rows = getDb()
    .select({ item: buildItems, part: parts, product: products })
    .from(buildItems)
    .innerJoin(parts, eq(buildItems.partId, parts.id))
    .innerJoin(products, eq(parts.productId, products.id))
    .where(eq(buildItems.buildId, buildId))
    .all();

  return rows.map(({ item, part, product }) => ({
    buildId: item.buildId,
    partId: item.partId,
    ...(item.slot != null ? { slot: item.slot } : {}),
    addedAt: item.addedAt,
    part: toPartDTO(part),
    product: toProductDTO(product),
  }));
}

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(Build) } },
        description: 'Builds for the local owner',
      },
    },
  }),
  (c) => {
    const rows = getDb().select().from(builds).where(eq(builds.ownerId, LOCAL_OWNER_ID)).all();
    return c.json(
      rows.map((row) => toBuildDTO(row)),
      200,
    );
  },
);

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { content: { 'application/json': { schema: Build } }, description: 'Build found' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const row = getDb().select().from(builds).where(eq(builds.id, id)).get();
    if (!row) {
      const body: ApiError = { error: { code: 'not_found', message: `Build ${id} not found` } };
      return c.json(body, 404);
    }
    return c.json(toBuildDTO(row, { items: loadItems(row.id) }), 200);
  },
);

/** D5 — every quote ever recorded for this product, oldest-first-irrelevant: `valuate()` itself picks the precedence winner and the latest-within-kind. */
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

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/valuation',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: Valuation } },
        description: 'D5 — acquired vs. current value for this build, by kind precedence',
      },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const build = getDb().select().from(builds).where(eq(builds.id, id)).get();
    if (!build) {
      const body: ApiError = { error: { code: 'not_found', message: `Build ${id} not found` } };
      return c.json(body, 404);
    }

    const rows = getDb()
      .select({ part: parts, product: products })
      .from(buildItems)
      .innerJoin(parts, eq(buildItems.partId, parts.id))
      .innerJoin(products, eq(parts.productId, products.id))
      .where(eq(buildItems.buildId, id))
      .all();

    const items: ValuateItemInput[] = rows.map(({ part, product }) => ({
      partId: part.id,
      acquiredCents: part.acquiredPriceCents,
      quotes: loadQuotesForProduct(product.id),
    }));

    const valuation = valuate({ buildId: id, currency: 'USD', items });
    return c.json(valuation, 200);
  },
);
