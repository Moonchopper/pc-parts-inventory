import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ApiError, Category, PriceQuote, Product, ProviderLink, QuoteKind } from '@pcpi/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { requireAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { priceQuotes, products, providerLinks } from '../db/schema.js';
import { LOCAL_OWNER_ID } from '../db/seed.js';
import { toProductDTO } from '../dto.js';
import { generateId } from '../ids.js';
import { enqueueJob } from '../jobs/runner.js';
import { validationHook } from '../openapi-hook.js';
import { toPriceQuoteDTO, toProviderLinkDTO } from '../pricing/dto.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

/**
 * D3 — read: open, write: token. A plain `routes.use(path, requireAuth)` would gate every method
 * on that path, but `/{id}` and `/{id}/links` each mix an open GET with a token-gated write — so
 * this only calls through to `requireAuth` for the methods named, exactly like `imports/routes.ts`
 * does for its single-method `/scans` path but generalised to a method allowlist.
 */
function requireAuthFor(methods: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    if (!methods.includes(c.req.method)) {
      await next();
      return;
    }
    return requireAuth(c, next);
  };
}

// Hono's native `:param` syntax — `.use()` is not translated from OpenAPI's `{param}` form the way
// `.openapi()`'s `path` is.
routes.use('/:id', requireAuthFor(['PATCH']));
routes.use('/:id/refresh', requireAuth);
routes.use('/:id/links', requireAuthFor(['POST']));
routes.use('/:id/links/:linkId', requireAuth);

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    request: { query: z.object({ category: Category.optional() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(Product) } },
        description: 'Products for the local owner',
      },
    },
  }),
  (c) => {
    const { category } = c.req.valid('query');
    const conditions = [eq(products.ownerId, LOCAL_OWNER_ID)];
    if (category) conditions.push(eq(products.category, category));
    const rows = getDb()
      .select()
      .from(products)
      .where(and(...conditions))
      .all();
    return c.json(rows.map(toProductDTO), 200);
  },
);

function loadProduct(id: string) {
  return getDb().select().from(products).where(eq(products.id, id)).get();
}

function notFoundProduct(id: string): ApiError {
  return { error: { code: 'not_found', message: `Product ${id} not found` } };
}

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { content: { 'application/json': { schema: Product } }, description: 'Product found' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const row = loadProduct(id);
    if (!row) return c.json(notFoundProduct(id), 404);
    return c.json(toProductDTO(row), 200);
  },
);

const ProductPatchBody = z
  .object({
    category: Category.optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    partNumber: z.string().optional(),
    upc: z.string().optional(),
    specs: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('ProductPatch');

routes.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: ProductPatchBody } } },
    },
    responses: {
      200: { content: { 'application/json': { schema: Product } }, description: 'Product updated' },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');
    const db = getDb();
    if (!loadProduct(id)) return c.json(notFoundProduct(id), 404);

    db.update(products)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(products.id, id))
      .run();

    const updated = loadProduct(id);
    if (!updated) throw new Error(`product ${id} vanished immediately after being updated`);
    return c.json(toProductDTO(updated), 200);
  },
);

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/quotes',
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({ kind: QuoteKind.optional() }),
    },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(PriceQuote) } },
        description: 'Price quotes for this product, newest first',
      },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const { kind } = c.req.valid('query');
    if (!loadProduct(id)) return c.json(notFoundProduct(id), 404);

    const conditions = [eq(priceQuotes.productId, id)];
    if (kind) conditions.push(eq(priceQuotes.kind, kind));
    const rows = getDb()
      .select()
      .from(priceQuotes)
      .where(and(...conditions))
      .orderBy(desc(priceQuotes.observedAt))
      .all();
    return c.json(rows.map(toPriceQuoteDTO), 200);
  },
);

routes.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/refresh',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      202: {
        content: { 'application/json': { schema: z.object({ jobId: z.string() }) } },
        description: 'A price_refresh job was enqueued for this product',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const product = loadProduct(id);
    if (!product) return c.json(notFoundProduct(id), 404);

    const jobId = enqueueJob('price_refresh', product.ownerId, { productId: id });
    return c.json({ jobId }, 202);
  },
);

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/links',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(ProviderLink) } },
        description: 'Provider links for this product',
      },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    if (!loadProduct(id)) return c.json(notFoundProduct(id), 404);

    const rows = getDb().select().from(providerLinks).where(eq(providerLinks.productId, id)).all();
    return c.json(rows.map(toProviderLinkDTO), 200);
  },
);

const CreateLinkBody = z
  .object({
    provider: z.string(),
    externalId: z.string(),
    url: z.string().optional(),
    confidence: z.number(),
    verified: z.boolean().optional(),
  })
  .openapi('CreateProviderLink');

routes.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/links',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: CreateLinkBody } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: ProviderLink } },
        description: 'Manual provider link created',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    if (!loadProduct(id)) return c.json(notFoundProduct(id), 404);

    const db = getDb();
    const linkId = generateId('link');
    db.insert(providerLinks)
      .values({
        id: linkId,
        productId: id,
        provider: body.provider,
        externalId: body.externalId,
        ...(body.url ? { url: body.url } : {}),
        confidence: body.confidence,
        verified: body.verified ?? false,
        createdAt: new Date().toISOString(),
      })
      .run();

    const row = db.select().from(providerLinks).where(eq(providerLinks.id, linkId)).get();
    if (!row) throw new Error(`provider link ${linkId} vanished immediately after being created`);
    return c.json(toProviderLinkDTO(row), 201);
  },
);

const PatchLinkBody = z.object({ verified: z.boolean() }).openapi('ProviderLinkPatch');

routes.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}/links/{linkId}',
    request: {
      params: z.object({ id: z.string(), linkId: z.string() }),
      body: { content: { 'application/json': { schema: PatchLinkBody } } },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: ProviderLink } },
        description: 'Provider link updated',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id, linkId } = c.req.valid('param');
    const { verified } = c.req.valid('json');
    const db = getDb();

    const existing = db
      .select()
      .from(providerLinks)
      .where(and(eq(providerLinks.id, linkId), eq(providerLinks.productId, id)))
      .get();
    if (!existing) {
      const body: ApiError = {
        error: { code: 'not_found', message: `Provider link ${linkId} not found on product ${id}` },
      };
      return c.json(body, 404);
    }

    db.update(providerLinks).set({ verified }).where(eq(providerLinks.id, linkId)).run();
    const updated = db.select().from(providerLinks).where(eq(providerLinks.id, linkId)).get();
    if (!updated)
      throw new Error(`provider link ${linkId} vanished immediately after being updated`);
    return c.json(toProviderLinkDTO(updated), 200);
  },
);
