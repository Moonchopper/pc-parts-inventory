import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { BuildItemExpanded } from '@pcpi/contracts';
import {
  ApiError,
  Build,
  BuildCreate,
  BuildItemCreate,
  BuildItemExpanded as BuildItemExpandedSchema,
  BuildPatch,
  compareByCategoryOrder,
  Valuation,
} from '@pcpi/contracts';
import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { requireAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { buildItems, builds, parts, products } from '../db/schema.js';
import { LOCAL_OWNER_ID } from '../db/seed.js';
import { toBuildDTO, toPartDTO, toProductDTO } from '../dto.js';
import { generateId, generateSlug } from '../ids.js';
import { validationHook } from '../openapi-hook.js';
import { computeValuation } from './valuation.js';

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
routes.use('/:id/items', requireAuth);
routes.use('/:id/items/:partId', requireAuth);

function loadBuild(id: string) {
  return getDb().select().from(builds).where(eq(builds.id, id)).get();
}

function notFoundBuild(id: string): ApiError {
  return { error: { code: 'not_found', message: `Build ${id} not found` } };
}

/** Task 3 (architect-directed, 2026-09-05) — category, then manufacturer, then model, then quantity
 * descending, sorted once here so the JSON, web page, Markdown and PNG never disagree with each
 * other or with themselves across runs. */
const orderBuildItems = compareByCategoryOrder<BuildItemExpanded>((item) => ({
  category: item.product.category,
  manufacturer: item.product.manufacturer,
  model: item.product.model,
  quantity: item.part.quantity,
}));

function loadItems(buildId: string): BuildItemExpanded[] {
  const rows = getDb()
    .select({ item: buildItems, part: parts, product: products })
    .from(buildItems)
    .innerJoin(parts, eq(buildItems.partId, parts.id))
    .innerJoin(products, eq(parts.productId, products.id))
    .where(eq(buildItems.buildId, buildId))
    .all();

  const items = rows.map(({ item, part, product }) => ({
    buildId: item.buildId,
    partId: item.partId,
    ...(item.slot != null ? { slot: item.slot } : {}),
    addedAt: item.addedAt,
    part: toPartDTO(part),
    product: toProductDTO(product),
  }));

  return items.sort(orderBuildItems);
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
    method: 'post',
    path: '/',
    request: { body: { content: { 'application/json': { schema: BuildCreate } } } },
    responses: {
      201: { content: { 'application/json': { schema: Build } }, description: 'Build created' },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
    },
  }),
  (c) => {
    const body = c.req.valid('json');
    const db = getDb();

    const id = generateId('build');
    const ts = new Date().toISOString();
    // D7 — 10-char lowercase base32, globally unique; the same generator the scan importer uses.
    // Collisions are astronomically unlikely (32^10 space) but checked anyway, same as any
    // generated-key insert would be.
    let slug = generateSlug();
    while (db.select().from(builds).where(eq(builds.slug, slug)).get()) {
      slug = generateSlug();
    }

    db.insert(builds)
      .values({
        id,
        ownerId: LOCAL_OWNER_ID,
        slug,
        name: body.name,
        ...(body.description !== undefined ? { description: body.description } : {}),
        source: 'manual',
        ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const row = loadBuild(id);
    if (!row) throw new Error(`build ${id} vanished immediately after being created`);
    return c.json(toBuildDTO(row), 201);
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
    const row = loadBuild(id);
    if (!row) return c.json(notFoundBuild(id), 404);
    return c.json(toBuildDTO(row, { items: loadItems(row.id) }), 200);
  },
);

routes.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: BuildPatch } } },
    },
    responses: {
      200: { content: { 'application/json': { schema: Build } }, description: 'Build updated' },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
      409: {
        content: { 'application/json': { schema: ApiError } },
        description: 'slug already in use',
      },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const patch = c.req.valid('json');
    const db = getDb();

    const existing = loadBuild(id);
    if (!existing) return c.json(notFoundBuild(id), 404);

    if (patch.slug !== undefined && patch.slug !== existing.slug) {
      const clash = db.select().from(builds).where(eq(builds.slug, patch.slug)).get();
      if (clash) {
        const body: ApiError = {
          error: { code: 'slug_conflict', message: `Slug ${patch.slug} is already in use` },
        };
        return c.json(body, 409);
      }
    }

    db.update(builds)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(builds.id, id))
      .run();

    const updated = loadBuild(id);
    if (!updated) throw new Error(`build ${id} vanished immediately after being updated`);
    return c.json(toBuildDTO(updated), 200);
  },
);

const DeletedAck = z.object({ deleted: z.literal(true) }).openapi('DeletedAck');

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: DeletedAck } },
        description: 'Build deleted; its parts are shelved (status=on_shelf), never deleted',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const db = getDb();
    if (!loadBuild(id)) return c.json(notFoundBuild(id), 404);

    db.transaction((tx) => {
      const ts = new Date().toISOString();
      const items = tx.select().from(buildItems).where(eq(buildItems.buildId, id)).all();
      for (const item of items) {
        tx.update(parts)
          .set({ status: 'on_shelf', updatedAt: ts })
          .where(eq(parts.id, item.partId))
          .run();
      }
      tx.delete(buildItems).where(eq(buildItems.buildId, id)).run();
      tx.delete(builds).where(eq(builds.id, id)).run();
    });

    return c.json({ deleted: true } as const, 200);
  },
);

const RemovedAck = z.object({ removed: z.literal(true) }).openapi('RemovedAck');

routes.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/items',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: BuildItemCreate } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: BuildItemExpandedSchema } },
        description: 'Part added to the build',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: {
        content: { 'application/json': { schema: ApiError } },
        description: 'Unknown build or part',
      },
      409: {
        content: { 'application/json': { schema: ApiError } },
        description:
          'Part is already in another build (one-build-per-part) — body names the current buildId',
      },
    },
  }),
  (c) => {
    const { id: buildId } = c.req.valid('param');
    const { partId, slot } = c.req.valid('json');
    const db = getDb();

    const build = loadBuild(buildId);
    if (!build) return c.json(notFoundBuild(buildId), 404);

    const part = db.select().from(parts).where(eq(parts.id, partId)).get();
    if (!part) {
      const body: ApiError = { error: { code: 'not_found', message: `Part ${partId} not found` } };
      return c.json(body, 404);
    }

    const existingItem = db.select().from(buildItems).where(eq(buildItems.partId, partId)).get();
    if (existingItem) {
      const body: ApiError = {
        error: {
          code: 'part_in_build',
          message: `Part ${partId} is already in build ${existingItem.buildId}`,
          details: { buildId: existingItem.buildId },
        },
      };
      return c.json(body, 409);
    }

    const ts = new Date().toISOString();
    db.transaction((tx) => {
      tx.insert(buildItems)
        .values({ buildId, partId, ...(slot !== undefined ? { slot } : {}), addedAt: ts })
        .run();
      tx.update(parts).set({ status: 'in_build', updatedAt: ts }).where(eq(parts.id, partId)).run();
    });

    const product = db.select().from(products).where(eq(products.id, part.productId)).get();
    if (!product) throw new Error(`product ${part.productId} vanished while adding a build item`);
    const updatedPart = db.select().from(parts).where(eq(parts.id, partId)).get();
    if (!updatedPart) throw new Error(`part ${partId} vanished immediately after being added`);

    const item: BuildItemExpanded = {
      buildId,
      partId,
      ...(slot !== undefined ? { slot } : {}),
      addedAt: ts,
      part: toPartDTO(updatedPart),
      product: toProductDTO(product),
    };
    return c.json(item, 201);
  },
);

routes.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}/items/{partId}',
    request: { params: z.object({ id: z.string(), partId: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: RemovedAck } },
        description: 'Part removed from the build (part itself still exists, now on_shelf)',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: {
        content: { 'application/json': { schema: ApiError } },
        description: 'Unknown build, unknown part, or part is not in that build',
      },
    },
  }),
  (c) => {
    const { id: buildId, partId } = c.req.valid('param');
    const db = getDb();

    const build = loadBuild(buildId);
    if (!build) return c.json(notFoundBuild(buildId), 404);

    const part = db.select().from(parts).where(eq(parts.id, partId)).get();
    if (!part) {
      const body: ApiError = { error: { code: 'not_found', message: `Part ${partId} not found` } };
      return c.json(body, 404);
    }

    const item = db
      .select()
      .from(buildItems)
      .where(and(eq(buildItems.buildId, buildId), eq(buildItems.partId, partId)))
      .get();
    if (!item) {
      const body: ApiError = {
        error: { code: 'not_found', message: `Part ${partId} is not in build ${buildId}` },
      };
      return c.json(body, 404);
    }

    const ts = new Date().toISOString();
    db.transaction((tx) => {
      tx.delete(buildItems)
        .where(and(eq(buildItems.buildId, buildId), eq(buildItems.partId, partId)))
        .run();
      tx.update(parts).set({ status: 'on_shelf', updatedAt: ts }).where(eq(parts.id, partId)).run();
    });

    return c.json({ removed: true } as const, 200);
  },
);

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
    const build = loadBuild(id);
    if (!build) return c.json(notFoundBuild(id), 404);

    const valuation = computeValuation(id, build.ownerId);
    return c.json(valuation, 200);
  },
);
