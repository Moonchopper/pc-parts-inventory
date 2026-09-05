import { createHash } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ImportSummary } from '@pcpi/contracts';
import { ApiError, Import, ScanPayload } from '@pcpi/contracts';
import { normalizeScan } from '@pcpi/core';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { requireAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { buildItems, builds, imports, parts, products } from '../db/schema.js';
import { LOCAL_OWNER_ID } from '../db/seed.js';
import { toImportDTO } from '../dto.js';
import { generateId, generateSlug } from '../ids.js';
import { validationHook } from '../openapi-hook.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

routes.use('/scans', requireAuth);

function nowIso(): string {
  return new Date().toISOString();
}

function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * D8 scan import. Idempotent on `payloadHash`: an identical second POST short-circuits to the
 * existing `Import` row before touching products/parts/builds at all, so `productsUpdated` /
 * `partsUpdated` stay 0 on a byte-identical replay (200, not 201).
 */
function processScan(payload: z.infer<typeof ScanPayload>): { importId: string; created: boolean } {
  const db = getDb();
  const payloadHash = hashPayload(payload);

  const existing = db.select().from(imports).where(eq(imports.payloadHash, payloadHash)).get();
  if (existing) {
    return { importId: existing.id, created: false };
  }

  const importId = generateId('import');
  const receivedAt = nowIso();
  const normalized = normalizeScan(payload);

  db.transaction((tx) => {
    // 0. Insert the Import row first, as a placeholder (`status: 'received'`), so that `parts.importId`
    //    (a foreign key) has something to point at while products/parts are being written below. It
    //    is updated to `status: 'processed'` with the real summary once that work is done.
    tx.insert(imports)
      .values({
        id: importId,
        ownerId: LOCAL_OWNER_ID,
        kind: 'scan',
        source: 'api',
        payloadHash,
        payload,
        status: 'received',
        receivedAt,
      })
      .run();

    // 1. One build per hostname (D8).
    let build = tx
      .select()
      .from(builds)
      .where(
        and(
          eq(builds.ownerId, LOCAL_OWNER_ID),
          eq(builds.hostname, payload.host.hostname),
          eq(builds.source, 'scan'),
        ),
      )
      .get();
    if (!build) {
      const buildId = generateId('build');
      const ts = nowIso();
      tx.insert(builds)
        .values({
          id: buildId,
          ownerId: LOCAL_OWNER_ID,
          slug: generateSlug(),
          name: payload.host.hostname,
          source: 'scan',
          hostname: payload.host.hostname,
          visibility: 'unlisted',
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      build = tx.select().from(builds).where(eq(builds.id, buildId)).get();
    }
    if (!build) throw new Error('build creation failed');
    const buildId = build.id;

    // 2. Products: identity = (category, manufacturer, model, partNumber?) (D8).
    let productsCreated = 0;
    let productsUpdated = 0;
    const productKeyToId = new Map<string, string>();
    for (const normProduct of normalized.products) {
      const partNumber = normProduct.partNumber;
      const match =
        partNumber === null ? isNull(products.partNumber) : eq(products.partNumber, partNumber);
      const existingProduct = tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.ownerId, LOCAL_OWNER_ID),
            eq(products.category, normProduct.category),
            eq(products.manufacturer, normProduct.manufacturer),
            eq(products.model, normProduct.model),
            match,
          ),
        )
        .get();

      if (existingProduct) {
        tx.update(products)
          .set({ specs: normProduct.specs, updatedAt: nowIso() })
          .where(eq(products.id, existingProduct.id))
          .run();
        productKeyToId.set(normProduct.productKey, existingProduct.id);
        productsUpdated += 1;
      } else {
        const productId = generateId('prod');
        const ts = nowIso();
        tx.insert(products)
          .values({
            id: productId,
            ownerId: LOCAL_OWNER_ID,
            category: normProduct.category,
            manufacturer: normProduct.manufacturer,
            model: normProduct.model,
            partNumber: normProduct.partNumber,
            specs: normProduct.specs,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
        productKeyToId.set(normProduct.productKey, productId);
        productsCreated += 1;
      }
    }

    // 3. Parts: identity = D8 identityKey. One ScanComponent -> one Part, always.
    let partsCreated = 0;
    let partsUpdated = 0;
    const touchedPartIds = new Set<string>();
    for (const normPart of normalized.parts) {
      const productId = productKeyToId.get(normPart.productKey);
      if (!productId) throw new Error(`no product for key ${normPart.productKey}`);

      const existingPart = tx
        .select()
        .from(parts)
        .where(and(eq(parts.ownerId, LOCAL_OWNER_ID), eq(parts.identityKey, normPart.identityKey)))
        .get();

      let partId: string;
      if (existingPart) {
        partId = existingPart.id;
        tx.update(parts)
          .set({
            productId,
            serial: normPart.serial,
            quantity: normPart.quantity,
            status: 'in_build',
            importId,
            updatedAt: nowIso(),
          })
          .where(eq(parts.id, partId))
          .run();
        partsUpdated += 1;
      } else {
        partId = generateId('part');
        const ts = nowIso();
        tx.insert(parts)
          .values({
            id: partId,
            ownerId: LOCAL_OWNER_ID,
            productId,
            serial: normPart.serial,
            condition: 'used',
            quantity: normPart.quantity,
            status: 'in_build',
            acquiredCurrency: 'USD',
            importId,
            identityKey: normPart.identityKey,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
        partsCreated += 1;
      }
      touchedPartIds.add(partId);

      const existingBuildItem = tx
        .select()
        .from(buildItems)
        .where(eq(buildItems.partId, partId))
        .get();
      if (!existingBuildItem) {
        tx.insert(buildItems)
          .values({ buildId, partId, slot: normPart.slot, addedAt: nowIso() })
          .run();
      } else if (existingBuildItem.buildId !== buildId) {
        tx.update(buildItems)
          .set({ buildId, slot: normPart.slot })
          .where(eq(buildItems.partId, partId))
          .run();
      }
    }

    // 4. Components missing from this scan -> on_shelf, never deleted (D8).
    const touched = [...touchedPartIds];
    const staleBuildItems =
      touched.length > 0
        ? tx
            .select()
            .from(buildItems)
            .where(and(eq(buildItems.buildId, buildId), notInArray(buildItems.partId, touched)))
            .all()
        : tx.select().from(buildItems).where(eq(buildItems.buildId, buildId)).all();

    let partsShelved = 0;
    for (const item of staleBuildItems) {
      tx.update(parts)
        .set({ status: 'on_shelf', updatedAt: nowIso() })
        .where(eq(parts.id, item.partId))
        .run();
      tx.delete(buildItems).where(eq(buildItems.partId, item.partId)).run();
      partsShelved += 1;
    }

    const summary: ImportSummary = {
      productsCreated,
      productsUpdated,
      partsCreated,
      partsUpdated,
      partsShelved,
      buildId,
    };

    tx.update(imports)
      .set({ status: 'processed', summary, processedAt: nowIso() })
      .where(eq(imports.id, importId))
      .run();
  });

  return { importId, created: true };
}

routes.openapi(
  createRoute({
    method: 'post',
    path: '/scans',
    request: {
      body: { content: { 'application/json': { schema: ScanPayload } } },
    },
    responses: {
      201: { content: { 'application/json': { schema: Import } }, description: 'Import created' },
      200: {
        content: { 'application/json': { schema: Import } },
        description: 'Payload already imported (idempotent replay)',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
    },
  }),
  (c) => {
    const payload = c.req.valid('json');
    const { importId, created } = processScan(payload);
    const row = getDb().select().from(imports).where(eq(imports.id, importId)).get();
    if (!row) {
      // Not a declared response for this route (only 200/201/401 are) — an internal error, so let
      // the shared onError handler in app.ts produce the §4 shape as a 500.
      throw new Error(`Import ${importId} vanished immediately after being written`);
    }
    return c.json(toImportDTO(row), created ? 201 : 200);
  },
);

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { content: { 'application/json': { schema: Import } }, description: 'Import found' },
      404: { content: { 'application/json': { schema: ApiError } }, description: 'Not found' },
    },
  }),
  (c) => {
    const { id } = c.req.valid('param');
    const row = getDb().select().from(imports).where(eq(imports.id, id)).get();
    if (!row) {
      const body: ApiError = { error: { code: 'not_found', message: `Import ${id} not found` } };
      return c.json(body, 404);
    }
    return c.json(toImportDTO(row), 200);
  },
);
