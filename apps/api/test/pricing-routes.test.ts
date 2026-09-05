import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { parts, priceQuotes, products } from '../src/db/schema.js';
import { LOCAL_OWNER_ID, seedOwner } from '../src/db/seed.js';
import { generateId } from '../src/ids.js';

process.env.DATABASE_URL = ':memory:';
process.env.PRICING_PROVIDERS = 'fixture';
delete process.env.BESTBUY_API_KEY;
delete process.env.API_TOKEN;

let app: App;

beforeAll(() => {
  runMigrations();
  seedOwner();
  app = createApp();
});

function insertProduct(): string {
  const id = generateId('prod');
  const now = new Date().toISOString();
  getDb()
    .insert(products)
    .values({
      id,
      ownerId: LOCAL_OWNER_ID,
      category: 'cpu',
      manufacturer: 'Test',
      model: 'Product',
      specs: {},
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe('GET /api/v1/providers', () => {
  it('lists fixture (configured: true) and bestbuy (configured: false — no BESTBUY_API_KEY)', async () => {
    const res = await app.request('/api/v1/providers');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'fixture', configured: true }),
        expect.objectContaining({ id: 'bestbuy', configured: false }),
      ]),
    );
  });
});

describe('GET/PATCH /api/v1/products/{id}', () => {
  it('GET returns the product; 404 for unknown', async () => {
    const id = insertProduct();
    const res = await app.request(`/api/v1/products/${id}`);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(id);

    const missing = await app.request('/api/v1/products/does-not-exist');
    expect(missing.status).toBe(404);
  });

  it('PATCH updates fields and requires a token when API_TOKEN is set (D3)', async () => {
    const id = insertProduct();
    const openPatch = await app.request(`/api/v1/products/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'Renamed Product' }),
    });
    expect(openPatch.status).toBe(200);
    expect((await openPatch.json()).model).toBe('Renamed Product');

    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/products/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'Should Not Apply' }),
      });
      expect(unauthed.status).toBe(401);

      const authed = await app.request(`/api/v1/products/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ model: 'Applied' }),
      });
      expect(authed.status).toBe(200);
      expect((await authed.json()).model).toBe('Applied');
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('Product links (D11)', () => {
  it('POST creates a manual link (token), GET lists it (open), PATCH verifies it (token)', async () => {
    const id = insertProduct();

    const unauthedCreate = await app.request(`/api/v1/products/${id}/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'fixture', externalId: 'mm:test|product', confidence: 0.4 }),
    });
    // Open by default (API_TOKEN unset) — this call should succeed, proving the 401 case below is
    // really about the token gate and not some other failure.
    expect(unauthedCreate.status).toBe(201);
    const created = await unauthedCreate.json();
    expect(created).toMatchObject({ productId: id, provider: 'fixture', verified: false });

    const listRes = await app.request(`/api/v1/products/${id}/links`);
    expect(listRes.status).toBe(200);
    expect(await listRes.json()).toHaveLength(1);

    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthedPatch = await app.request(`/api/v1/products/${id}/links/${created.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ verified: true }),
      });
      expect(unauthedPatch.status).toBe(401);

      const authedPatch = await app.request(`/api/v1/products/${id}/links/${created.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ verified: true }),
      });
      expect(authedPatch.status).toBe(200);
      expect((await authedPatch.json()).verified).toBe(true);
    } finally {
      delete process.env.API_TOKEN;
    }
  });

  it('PATCH 404s for a link that does not belong to the product', async () => {
    const a = insertProduct();
    const b = insertProduct();
    const createRes = await app.request(`/api/v1/products/${a}/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'fixture', externalId: 'mm:x|y', confidence: 0.4 }),
    });
    const link = await createRes.json();

    const res = await app.request(`/api/v1/products/${b}/links/${link.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verified: true }),
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/products/{id}/refresh + GET /quotes', () => {
  it('enqueues a price_refresh job (202), and after `run-due` the quote shows up newest-first / filterable by kind', async () => {
    const id = insertProduct();
    getDb()
      .update(products)
      .set({ manufacturer: 'AMD', model: 'Ryzen 7 9800X3D' })
      .where(eq(products.id, id))
      .run();

    const refreshRes = await app.request(`/api/v1/products/${id}/refresh`, { method: 'POST' });
    expect(refreshRes.status).toBe(202);
    const { jobId } = await refreshRes.json();
    expect(typeof jobId).toBe('string');

    process.env.HARNESS = '1';
    try {
      const runDue = await app.request('/api/v1/jobs/run-due', { method: 'POST' });
      expect(runDue.status).toBe(200);
    } finally {
      delete process.env.HARNESS;
    }

    const quotesRes = await app.request(`/api/v1/products/${id}/quotes`);
    expect(quotesRes.status).toBe(200);
    const quotes = await quotesRes.json();
    expect(quotes.length).toBeGreaterThanOrEqual(1);
    expect(quotes[0]).toMatchObject({ productId: id, kind: 'new_retail' });

    const filtered = await app.request(`/api/v1/products/${id}/quotes?kind=new_retail`);
    expect((await filtered.json()).length).toBeGreaterThanOrEqual(1);
    const filteredOut = await app.request(`/api/v1/products/${id}/quotes?kind=msrp`);
    expect(await filteredOut.json()).toEqual([]);
  });

  it('refresh requires a token when API_TOKEN is set (D3)', async () => {
    const id = insertProduct();
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/products/${id}/refresh`, { method: 'POST' });
      expect(unauthed.status).toBe(401);
      const authed = await app.request(`/api/v1/products/${id}/refresh`, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token' },
      });
      expect(authed.status).toBe(202);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('GET /api/v1/builds/{id}/valuation (D5)', () => {
  it('picks the used_market quote over new_retail/msrp and computes acquired/current/delta', async () => {
    // Build the smallest possible scanned build directly through the real import path so
    // build_items/parts wiring matches production exactly, then attach quotes by hand.
    const scanRes = await app.request('/api/v1/imports/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        scanner: { name: 'test', version: '0.0.0', os: 'windows' },
        host: { hostname: 'VALUATION-TEST-HOST', scannedAt: new Date().toISOString() },
        components: [
          {
            category: 'cpu',
            manufacturer: 'ValuationCo',
            model: 'Chip 1',
            serial: 'VAL-SN-0001',
            quantity: 1,
            specs: {},
          },
        ],
      }),
    });
    expect(scanRes.status).toBe(201);
    const { summary } = await scanRes.json();
    const buildId: string = summary.buildId;

    const buildRes = await app.request(`/api/v1/builds/${buildId}`);
    const build = await buildRes.json();
    const part = build.items[0].part;
    const productId: string = build.items[0].product.id;

    // Give the part an acquired price directly (no PATCH /parts/{id} endpoint in this brief's Scope).
    const db = getDb();
    db.update(parts).set({ acquiredPriceCents: 10000 }).where(eq(parts.id, part.id)).run();

    const quoteRow = (
      kind: 'msrp' | 'new_retail' | 'used_market',
      priceCents: number,
      observedAt: string,
    ) => ({
      id: generateId('quote'),
      productId,
      provider: 'manual',
      kind,
      priceCents,
      currency: 'USD',
      observedAt,
    });
    db.insert(priceQuotes)
      .values(quoteRow('msrp', 12000, '2026-08-01T00:00:00.000Z'))
      .run();
    db.insert(priceQuotes)
      .values(quoteRow('new_retail', 11000, '2026-08-20T00:00:00.000Z'))
      .run();
    db.insert(priceQuotes)
      .values(quoteRow('used_market', 9000, '2026-08-25T00:00:00.000Z'))
      .run();

    const valuationRes = await app.request(`/api/v1/builds/${buildId}/valuation`);
    expect(valuationRes.status).toBe(200);
    const valuation = await valuationRes.json();

    expect(valuation.acquiredCents).toBe(10000);
    expect(valuation.currentCents).toBe(9000); // used_market wins D5 precedence
    expect(valuation.deltaCents).toBe(valuation.currentCents - valuation.acquiredCents);
    expect(valuation.items[0].quote.kind).toBe('used_market');
  });

  it('404s for an unknown build', async () => {
    const res = await app.request('/api/v1/builds/does-not-exist/valuation');
    expect(res.status).toBe(404);
  });
});
