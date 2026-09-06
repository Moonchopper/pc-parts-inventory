import { beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { products } from '../src/db/schema.js';
import { LOCAL_OWNER_ID, seedOwner } from '../src/db/seed.js';
import { generateId } from '../src/ids.js';

process.env.DATABASE_URL = ':memory:';
delete process.env.API_TOKEN;

let app: App;

beforeAll(() => {
  runMigrations();
  seedOwner();
  app = createApp();
});

function insertProduct(
  overrides: Partial<{ category: string; manufacturer: string }> = {},
): string {
  const id = generateId('prod');
  const now = new Date().toISOString();
  getDb()
    .insert(products)
    .values({
      id,
      ownerId: LOCAL_OWNER_ID,
      category: (overrides.category ?? 'cpu') as never,
      manufacturer: overrides.manufacturer ?? 'Test',
      model: 'Product',
      specs: {},
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

async function createPart(productId: string, body: Record<string, unknown> = {}) {
  const res = await app.request('/api/v1/parts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId, ...body }),
  });
  return { res, body: await res.json() };
}

describe('POST /api/v1/parts', () => {
  it('creates a part with §3 defaults (status=on_shelf, quantity=1, acquiredCurrency=USD)', async () => {
    const productId = insertProduct();
    const { res, body } = await createPart(productId);
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      productId,
      status: 'on_shelf',
      quantity: 1,
      acquiredCurrency: 'USD',
      condition: 'used',
    });
    expect(body.product.id).toBe(productId);
  });

  it('404s when productId does not exist', async () => {
    const { res, body } = await createPart('does-not-exist');
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('not_found');
  });

  it('requires a token when API_TOKEN is set (D3), open otherwise', async () => {
    const productId = insertProduct();
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request('/api/v1/parts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
      });
      expect(unauthed.status).toBe(401);

      const authed = await app.request('/api/v1/parts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ productId }),
      });
      expect(authed.status).toBe(201);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('GET /api/v1/parts/{id}', () => {
  it('returns the part; 404 for unknown', async () => {
    const productId = insertProduct();
    const { body: created } = await createPart(productId);

    const res = await app.request(`/api/v1/parts/${created.id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(created.id);

    const missing = await app.request('/api/v1/parts/does-not-exist');
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/v1/parts/{id}', () => {
  it('accepts acquiredPriceCents, acquiredAt, acquiredSource, condition, status, notes, serial and round-trips them', async () => {
    const productId = insertProduct();
    const { body: created } = await createPart(productId);

    const patchRes = await app.request(`/api/v1/parts/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        acquiredPriceCents: 42_999,
        acquiredAt: '2026-01-15T00:00:00.000Z',
        acquiredSource: 'ebay',
        condition: 'refurbished',
        status: 'in_build',
        notes: 'bought used, works great',
        serial: 'SN-ROUNDTRIP-1',
      }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched).toMatchObject({
      acquiredPriceCents: 42_999,
      acquiredAt: '2026-01-15T00:00:00.000Z',
      acquiredSource: 'ebay',
      condition: 'refurbished',
      status: 'in_build',
      notes: 'bought used, works great',
      serial: 'SN-ROUNDTRIP-1',
    });

    const getRes = await app.request(`/api/v1/parts/${created.id}`);
    expect(await getRes.json()).toMatchObject({ acquiredPriceCents: 42_999 });
  });

  it('an empty body is a no-op 200, not a 400', async () => {
    const productId = insertProduct();
    const { body: created } = await createPart(productId);

    const res = await app.request(`/api/v1/parts/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe(created.status);
    expect(body.quantity).toBe(created.quantity);
  });

  it('404s for an unknown part', async () => {
    const res = await app.request('/api/v1/parts/does-not-exist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('requires a token when API_TOKEN is set (D3)', async () => {
    const productId = insertProduct();
    const { body: created } = await createPart(productId);
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/parts/${created.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: 'nope' }),
      });
      expect(unauthed.status).toBe(401);

      const authed = await app.request(`/api/v1/parts/${created.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ notes: 'yep' }),
      });
      expect(authed.status).toBe(200);
      expect((await authed.json()).notes).toBe('yep');
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('GET /api/v1/parts filters (status, category, buildId)', () => {
  it('filters combinably', async () => {
    const cpuProduct = insertProduct({ category: 'cpu' });
    const gpuProduct = insertProduct({ category: 'gpu' });
    const { body: shelfCpu } = await createPart(cpuProduct, { status: 'on_shelf' });
    const { body: soldGpu } = await createPart(gpuProduct, { status: 'sold' });

    const buildRes = await app.request('/api/v1/builds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Filter Test Build' }),
    });
    const build = await buildRes.json();
    await app.request(`/api/v1/builds/${build.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: shelfCpu.id }),
    });

    const byStatus = await app.request('/api/v1/parts?status=sold');
    const byStatusIds = (await byStatus.json()).map((p: { id: string }) => p.id);
    expect(byStatusIds).toContain(soldGpu.id);
    expect(byStatusIds).not.toContain(shelfCpu.id);

    const byCategory = await app.request('/api/v1/parts?category=gpu');
    const byCategoryIds = (await byCategory.json()).map((p: { id: string }) => p.id);
    expect(byCategoryIds).toContain(soldGpu.id);
    expect(byCategoryIds).not.toContain(shelfCpu.id);

    const byBuild = await app.request(`/api/v1/parts?buildId=${build.id}`);
    const byBuildIds = (await byBuild.json()).map((p: { id: string }) => p.id);
    expect(byBuildIds).toEqual([shelfCpu.id]);

    const combined = await app.request(`/api/v1/parts?category=cpu&buildId=${build.id}`);
    expect((await combined.json()).map((p: { id: string }) => p.id)).toEqual([shelfCpu.id]);
  });

  it('an unknown enum value is a 400 with the §4 error shape, not a silent empty list', async () => {
    const res = await app.request('/api/v1/parts?status=not-a-real-status');
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_request');
  });
});

describe('DELETE /api/v1/parts/{id}', () => {
  it('409s while in a build; 200 with ?force=1, and the build_items row is gone', async () => {
    const productId = insertProduct();
    const { body: part } = await createPart(productId);

    const buildRes = await app.request('/api/v1/builds', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Delete Test Build' }),
    });
    const build = await buildRes.json();
    await app.request(`/api/v1/builds/${build.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id }),
    });

    const blocked = await app.request(`/api/v1/parts/${part.id}`, { method: 'DELETE' });
    expect(blocked.status).toBe(409);
    const blockedBody = await blocked.json();
    expect(blockedBody.error.details).toMatchObject({ buildId: build.id });

    const forced = await app.request(`/api/v1/parts/${part.id}?force=1`, { method: 'DELETE' });
    expect(forced.status).toBe(200);
    expect(await forced.json()).toEqual({ deleted: true });

    const getPart = await app.request(`/api/v1/parts/${part.id}`);
    expect(getPart.status).toBe(404);

    const getBuild = await app.request(`/api/v1/builds/${build.id}`);
    expect((await getBuild.json()).items).toEqual([]);
  });

  it('404s for an unknown part', async () => {
    const res = await app.request('/api/v1/parts/does-not-exist', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('requires a token when API_TOKEN is set (D3)', async () => {
    const productId = insertProduct();
    const { body: part } = await createPart(productId);
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/parts/${part.id}`, { method: 'DELETE' });
      expect(unauthed.status).toBe(401);

      const authed = await app.request(`/api/v1/parts/${part.id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      });
      expect(authed.status).toBe(200);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});
