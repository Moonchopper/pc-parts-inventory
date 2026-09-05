import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { createApp } from '../src/app.js';
import { getDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { jobs, priceQuotes, products, providerLinks } from '../src/db/schema.js';
import { LOCAL_OWNER_ID, seedOwner } from '../src/db/seed.js';
import { generateId } from '../src/ids.js';
import { enqueueJob, runDueJobs } from '../src/jobs/runner.js';

// In-memory DB isolated to this test file (vitest gives each file its own module graph — see
// apps/api/test/api.test.ts for the established pattern this follows).
process.env.DATABASE_URL = ':memory:';
process.env.PRICING_PROVIDERS = 'fixture';
delete process.env.BESTBUY_API_KEY;
delete process.env.API_TOKEN;
delete process.env.HARNESS;

let app: App;

beforeAll(() => {
  runMigrations();
  seedOwner();
  app = createApp();
});

/** A fixture externalId that `packages/core/fixtures/quotes.json` really has a quote for. */
const REAL_FIXTURE_EXTERNAL_ID = 'mm:amd|ryzen 7 9800x3d';

function insertProduct(overrides: Partial<typeof products.$inferInsert> = {}): string {
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
      ...overrides,
    })
    .run();
  return id;
}

function insertLink(
  productId: string,
  overrides: Partial<typeof providerLinks.$inferInsert> = {},
): string {
  const id = generateId('link');
  getDb()
    .insert(providerLinks)
    .values({
      id,
      productId,
      provider: 'fixture',
      externalId: REAL_FIXTURE_EXTERNAL_ID,
      confidence: 1,
      verified: false,
      createdAt: new Date().toISOString(),
      ...overrides,
    })
    .run();
  return id;
}

function quotesFor(productId: string) {
  return getDb().select().from(priceQuotes).where(eq(priceQuotes.productId, productId)).all();
}

describe('jobs runner — D10 (ownerId addendum, "PM addendum 2")', () => {
  it('an enqueued job carries the ownerId of the thing it acts on (== "local", the seeded owner)', () => {
    const productId = insertProduct();
    const jobId = enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
    const row = getDb().select().from(jobs).where(eq(jobs.id, jobId)).get();
    expect(row?.ownerId).toBe('local');
  });
});

describe('jobs runner — D11 gating (verified OR confidence >= 0.9)', () => {
  it('confidence 0.5, verified false -> NOT quoted', async () => {
    const productId = insertProduct();
    insertLink(productId, { confidence: 0.5, verified: false });
    enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
    await runDueJobs();
    expect(quotesFor(productId)).toHaveLength(0);
  });

  it('confidence 0.5, verified true -> IS quoted', async () => {
    const productId = insertProduct();
    insertLink(productId, { confidence: 0.5, verified: true });
    enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
    await runDueJobs();
    expect(quotesFor(productId)).toHaveLength(1);
  });

  it('confidence 0.95, verified false -> IS quoted', async () => {
    const productId = insertProduct();
    insertLink(productId, { confidence: 0.95, verified: false });
    enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
    await runDueJobs();
    expect(quotesFor(productId)).toHaveLength(1);
  });
});

describe('jobs runner — D5 append-only', () => {
  it('refreshing twice leaves two rows, and the older one is untouched', async () => {
    const productId = insertProduct();
    insertLink(productId, { confidence: 1, verified: true });

    enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
    await runDueJobs();
    const afterFirst = quotesFor(productId);
    expect(afterFirst).toHaveLength(1);
    const firstRowSnapshot = { ...afterFirst[0] };

    enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
    await runDueJobs();
    const afterSecond = quotesFor(productId);
    expect(afterSecond).toHaveLength(2);

    const stillThere = afterSecond.find((q) => q.id === firstRowSnapshot.id);
    expect(stillThere).toEqual(firstRowSnapshot);
  });

  it('never overwrites a verified:true link when a product already has one', async () => {
    const productId = insertProduct();
    const linkId = insertLink(productId, { confidence: 0.2, verified: true });

    enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
    await runDueJobs();

    const linksAfter = getDb()
      .select()
      .from(providerLinks)
      .where(eq(providerLinks.productId, productId))
      .all();
    expect(linksAfter).toHaveLength(1);
    expect(linksAfter[0]?.id).toBe(linkId);
    expect(linksAfter[0]?.verified).toBe(true);
    expect(linksAfter[0]?.confidence).toBe(0.2);
  });
});

describe('enqueueJob wake-on-enqueue — F9/D18 (real DB, real fixture provider)', () => {
  it('three enqueueJob calls made back-to-back leave all three jobs done, with no explicit runDueJobs/run-due call', async () => {
    const previousVitest = process.env.VITEST;
    delete process.env.VITEST; // opt back into the wake this file's env normally disables
    try {
      const ids = [insertProduct(), insertProduct(), insertProduct()].map((productId) => {
        insertLink(productId, { confidence: 1, verified: true });
        return enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });
      });

      // Poll briefly — the wake is debounced (0ms) + async, not synchronous with enqueueJob.
      const deadline = Date.now() + 2000;
      let rows: Array<typeof jobs.$inferSelect> = [];
      for (;;) {
        rows = ids.map(
          (id) =>
            getDb().select().from(jobs).where(eq(jobs.id, id)).get() as typeof jobs.$inferSelect,
        );
        if (rows.every((r) => r.status === 'done')) break;
        if (Date.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 25));
      }

      expect(rows.map((r) => r.status)).toEqual(['done', 'done', 'done']);
    } finally {
      if (previousVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = previousVitest;
    }
  });

  it('no-ops under HARNESS=1 — an enqueued job stays queued (the harness must drive jobs deterministically via POST /jobs/run-due only)', async () => {
    const previousVitest = process.env.VITEST;
    const previousHarness = process.env.HARNESS;
    delete process.env.VITEST;
    process.env.HARNESS = '1';
    try {
      const productId = insertProduct();
      insertLink(productId, { confidence: 1, verified: true });
      const jobId = enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });

      await new Promise((r) => setTimeout(r, 100)); // give a (wrongly-firing) wake time to act

      const row = getDb().select().from(jobs).where(eq(jobs.id, jobId)).get();
      expect(row?.status).toBe('queued');
    } finally {
      if (previousVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = previousVitest;
      if (previousHarness === undefined) delete process.env.HARNESS;
      else process.env.HARNESS = previousHarness;
    }
  });
});

describe('POST /api/v1/jobs/run-due (D10 — HARNESS=1 / NODE_ENV=development only)', () => {
  it('404s when neither HARNESS=1 nor NODE_ENV=development', async () => {
    const previousHarness = process.env.HARNESS;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.HARNESS;
    process.env.NODE_ENV = 'test';
    try {
      const res = await app.request('/api/v1/jobs/run-due', { method: 'POST' });
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('not_found');
    } finally {
      if (previousHarness === undefined) delete process.env.HARNESS;
      else process.env.HARNESS = previousHarness;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('200s and runs due jobs when HARNESS=1', async () => {
    const productId = insertProduct();
    insertLink(productId, { confidence: 1, verified: true });
    enqueueJob('price_refresh', LOCAL_OWNER_ID, { productId });

    const previousHarness = process.env.HARNESS;
    process.env.HARNESS = '1';
    try {
      const res = await app.request('/api/v1/jobs/run-due', { method: 'POST' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ran).toBeGreaterThanOrEqual(1);
      expect(body.results.some((r: { status: string }) => r.status === 'done')).toBe(true);
    } finally {
      if (previousHarness === undefined) delete process.env.HARNESS;
      else process.env.HARNESS = previousHarness;
    }
  });

  it('requires a bearer token when API_TOKEN is set (D3)', async () => {
    process.env.API_TOKEN = 'secret-token';
    process.env.HARNESS = '1';
    try {
      const unauthed = await app.request('/api/v1/jobs/run-due', { method: 'POST' });
      expect(unauthed.status).toBe(401);

      const authed = await app.request('/api/v1/jobs/run-due', {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token' },
      });
      expect(authed.status).toBe(200);
    } finally {
      delete process.env.API_TOKEN;
      delete process.env.HARNESS;
    }
  });
});
