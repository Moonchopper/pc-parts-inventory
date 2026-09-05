import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScanPayload } from '@pcpi/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedOwner } from '../src/db/seed.js';

// In-memory DB, isolated to this test file's process/module graph (vitest gives each test file its
// own module instance). No network — every call below goes through Hono's `app.request()`.
process.env.DATABASE_URL = ':memory:';
delete process.env.API_TOKEN;

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../packages/contracts/fixtures/scan.sample.json');
const fixture = ScanPayload.parse(JSON.parse(readFileSync(fixturePath, 'utf-8')));

// Matches packages/core/test/normalize.test.ts — see that file for why these numbers.
const EXPECTED_PRODUCTS_CREATED = 6;
const EXPECTED_PARTS_CREATED = 7;

let app: App;

beforeAll(() => {
  runMigrations();
  seedOwner();
  app = createApp();
});

describe('GET /api/v1/health', () => {
  it('reports ok/sqlite', async () => {
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, db: 'sqlite' });
  });
});

describe('POST /api/v1/imports/scans (D8)', () => {
  it('creates products/parts/a build and returns 201 with a summary', async () => {
    const res = await app.request('/api/v1/imports/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fixture),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.status).toBe('processed');
    expect(created.summary).toMatchObject({
      productsCreated: EXPECTED_PRODUCTS_CREATED,
      productsUpdated: 0,
      partsCreated: EXPECTED_PARTS_CREATED,
      partsUpdated: 0,
      partsShelved: 0,
    });
  });

  it('GET /imports/{id} returns the same import', async () => {
    const postRes = await app.request('/api/v1/imports/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fixture),
    });
    const created = await postRes.json();
    const getRes = await app.request(`/api/v1/imports/${created.id}`);
    expect(getRes.status).toBe(200);
    expect((await getRes.json()).id).toBe(created.id);
  });

  it('GET /imports/{unknown} 404s with the §4 error shape', async () => {
    const res = await app.request('/api/v1/imports/does-not-exist');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('an identical second POST is idempotent: 200, no new rows', async () => {
    const res = await app.request('/api/v1/imports/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(fixture),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toMatchObject({
      productsCreated: EXPECTED_PRODUCTS_CREATED,
      productsUpdated: 0,
      partsCreated: EXPECTED_PARTS_CREATED,
      partsUpdated: 0,
      partsShelved: 0,
    });

    const productsRes = await app.request('/api/v1/products');
    expect(await productsRes.json()).toHaveLength(EXPECTED_PRODUCTS_CREATED);
    const partsRes = await app.request('/api/v1/parts');
    expect(await partsRes.json()).toHaveLength(EXPECTED_PARTS_CREATED);
  });

  it('requires a bearer token when API_TOKEN is set, open otherwise (D3)', async () => {
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request('/api/v1/imports/scans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fixture),
      });
      expect(unauthed.status).toBe(401);
      expect((await unauthed.json()).error.code).toBe('unauthorized');

      const authed = await app.request('/api/v1/imports/scans', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify(fixture),
      });
      // Already imported by the earlier tests in this file -> idempotent replay.
      expect(authed.status).toBe(200);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('GET /api/v1/builds, /parts, /products', () => {
  it('lists exactly one build (one hostname scanned) with all items', async () => {
    const listRes = await app.request('/api/v1/builds');
    const list = await listRes.json();
    expect(list).toHaveLength(1);

    const buildRes = await app.request(`/api/v1/builds/${list[0].id}`);
    expect(buildRes.status).toBe(200);
    const build = await buildRes.json();
    expect(build.items).toHaveLength(EXPECTED_PARTS_CREATED);
    expect(build.source).toBe('scan');
    expect(build.hostname).toBe(fixture.host.hostname);
  });

  it('GET /builds/{unknown} 404s', async () => {
    const res = await app.request('/api/v1/builds/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/share/{slug}', () => {
  it('is readable, lists every model string, and never leaks serials/notes', async () => {
    const listRes = await app.request('/api/v1/builds');
    const [build] = await listRes.json();

    const shareRes = await app.request(`/api/v1/share/${build.slug}`);
    expect(shareRes.status).toBe(200);
    const shared = await shareRes.json();

    for (const component of fixture.components) {
      expect(JSON.stringify(shared)).toContain(component.model);
    }

    const raw = JSON.stringify(shared);
    expect(raw).not.toContain('GPU-SN-0001');
    expect(raw).not.toContain('MEM-SN-AAA');
    expect(raw).not.toContain('MEM-SN-BBB');
    expect(raw).not.toContain('STORAGE-SN-0001');
    expect(raw.toLowerCase()).not.toContain('serial');
    expect(raw.toLowerCase()).not.toContain('notes');
  });

  it('404s for an unknown slug', async () => {
    const res = await app.request('/api/v1/share/does-not-exist');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });
});
