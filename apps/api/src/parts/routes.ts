import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ApiError, Category, Part, PartCreate, PartPatch, PartStatus } from '@pcpi/contracts';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { requireAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { buildItems, parts, products } from '../db/schema.js';
import { LOCAL_OWNER_ID } from '../db/seed.js';
import { toPartDTO, toProductDTO } from '../dto.js';
import { generateId } from '../ids.js';
import { validationHook } from '../openapi-hook.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

/** D3 — read: open, write: token. See `products/routes.ts` for why this is a method allowlist
 * rather than a plain `routes.use(path, requireAuth)`: `/` mixes an open GET with a token-gated
 * POST. */
function requireAuthFor(methods: readonly string[]): MiddlewareHandler {
  return async (c, next) => {
    if (!methods.includes(c.req.method)) {
      await next();
      return;
    }
    return requireAuth(c, next);
  };
}

routes.use('/', requireAuthFor(['POST']));
routes.use('/:id', requireAuthFor(['PATCH', 'DELETE']));

function loadPartWithProduct(id: string) {
  return getDb()
    .select({ part: parts, product: products })
    .from(parts)
    .innerJoin(products, eq(parts.productId, products.id))
    .where(eq(parts.id, id))
    .get();
}

function notFoundPart(id: string): ApiError {
  return { error: { code: 'not_found', message: `Part ${id} not found` } };
}

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    request: {
      query: z.object({
        status: PartStatus.optional(),
        category: Category.optional(),
        buildId: z.string().optional(),
      }),
    },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(Part) } },
        description:
          'Parts for the local owner, embedding product; filterable by status/category/buildId',
      },
    },
  }),
  (c) => {
    const { status, category, buildId } = c.req.valid('query');
    const conditions = [eq(parts.ownerId, LOCAL_OWNER_ID)];
    if (status) conditions.push(eq(parts.status, status));
    if (category) conditions.push(eq(products.category, category));
    // Always left-joined (cheap — `build_items.partId` is unique, so it can never fan out a part
    // into more than one row) so the query shape stays static regardless of which filters are
    // present; `buildId` only takes effect via the extra `eq()` condition below.
    if (buildId) conditions.push(eq(buildItems.buildId, buildId));

    const rows = getDb()
      .select({ part: parts, product: products })
      .from(parts)
      .innerJoin(products, eq(parts.productId, products.id))
      .leftJoin(buildItems, eq(buildItems.partId, parts.id))
      .where(and(...conditions))
      .all();
    return c.json(
      rows.map(({ part, product }) => toPartDTO(part, { product: toProductDTO(product) })),
      200,
    );
  },
);

routes.openapi(
  createRoute({
    method: 'post',
    path: '/',
    request: { body: { content: { 'application/json': { schema: PartCreate } } } },
    responses: {
      201: { content: { 'application/json': { schema: Part } }, description: 'Part created' },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: {
        content: { 'application/json': { schema: ApiError } },
        description: 'productId does not exist for this owner',
      },
    },
  }),
  (c) => {
    const body = c.req.valid('json');
    const db = getDb();

    const product = db
      .select()
      .from(products)
      .where(and(eq(products.id, body.productId), eq(products.ownerId, LOCAL_OWNER_ID)))
      .get();
    if (!product) {
      const err: ApiError = {
        error: { code: 'not_found', message: `Product ${body.productId} not found` },
      };
      return c.json(err, 404);
    }

    const id = generateId('part');
    const ts = new Date().toISOString();
    const serial = body.serial?.trim() || undefined;
    // Not from a scan, so there is no ScanComponent to derive D8's identityKey from — fall back to
    // the serial when one was given (so a manually entered part still dedupes against a future scan
    // of the same serial, D8's intent), else a value derived from this part's own generated id,
    // which cannot collide with anything (a real serial, or a scan's `category|manufacturer|model|slot`
    // fallback — that shape always contains a `|`, this one never does).
    const identityKey = serial ?? `part:${id}`;

    db.insert(parts)
      .values({
        id,
        ownerId: LOCAL_OWNER_ID,
        productId: body.productId,
        ...(serial ? { serial } : {}),
        ...(body.condition !== undefined ? { condition: body.condition } : {}),
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.acquiredAt !== undefined ? { acquiredAt: body.acquiredAt } : {}),
        ...(body.acquiredPriceCents !== undefined
          ? { acquiredPriceCents: body.acquiredPriceCents }
          : {}),
        ...(body.acquiredCurrency !== undefined ? { acquiredCurrency: body.acquiredCurrency } : {}),
        ...(body.acquiredSource !== undefined ? { acquiredSource: body.acquiredSource } : {}),
        ...(body.soldAt !== undefined ? { soldAt: body.soldAt } : {}),
        ...(body.soldPriceCents !== undefined ? { soldPriceCents: body.soldPriceCents } : {}),
        identityKey,
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const row = loadPartWithProduct(id);
    if (!row) throw new Error(`part ${id} vanished immediately after being created`);
    return c.json(toPartDTO(row.part, { product: toProductDTO(row.product) }), 201);
  },
);

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { content: { 'application/json': { schema: Part } }, description: 'Part found' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const row = loadPartWithProduct(id);
    if (!row) return c.json(notFoundPart(id), 404);
    return c.json(toPartDTO(row.part, { product: toProductDTO(row.product) }), 200);
  },
);

routes.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: PartPatch } } },
    },
    responses: {
      200: { content: { 'application/json': { schema: Part } }, description: 'Part updated' },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');
    const db = getDb();
    if (!loadPartWithProduct(id)) return c.json(notFoundPart(id), 404);

    db.update(parts)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(parts.id, id))
      .run();

    const updated = loadPartWithProduct(id);
    if (!updated) throw new Error(`part ${id} vanished immediately after being updated`);
    return c.json(toPartDTO(updated.part, { product: toProductDTO(updated.product) }), 200);
  },
);

const DeletedAck = z.object({ deleted: z.literal(true) }).openapi('DeletedAck');

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({ force: z.string().optional() }),
    },
    responses: {
      200: { content: { 'application/json': { schema: DeletedAck } }, description: 'Part deleted' },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
      409: {
        content: { 'application/json': { schema: ApiError } },
        description: 'Part is in a build; pass ?force=1 to remove it from the build first',
      },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const { force } = c.req.valid('query');
    const db = getDb();

    const existing = db.select().from(parts).where(eq(parts.id, id)).get();
    if (!existing) return c.json(notFoundPart(id), 404);

    const buildItem = db.select().from(buildItems).where(eq(buildItems.partId, id)).get();
    if (buildItem && force !== '1') {
      const body: ApiError = {
        error: {
          code: 'part_in_build',
          message: `Part ${id} is in build ${buildItem.buildId}; pass ?force=1 to remove it from the build and delete it`,
          details: { buildId: buildItem.buildId },
        },
      };
      return c.json(body, 409);
    }

    db.transaction((tx) => {
      if (buildItem) {
        tx.delete(buildItems).where(eq(buildItems.partId, id)).run();
      }
      tx.delete(parts).where(eq(parts.id, id)).run();
    });

    return c.json({ deleted: true } as const, 200);
  },
);
