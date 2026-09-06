import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScanPayload } from '@pcpi/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedOwner } from '../src/db/seed.js';

// Its own in-memory DB, independent of api.test.ts's cumulative state.
process.env.DATABASE_URL = ':memory:';
delete process.env.API_TOKEN;

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../packages/contracts/fixtures/scan.sample.json');
const original = ScanPayload.parse(JSON.parse(readFileSync(fixturePath, 'utf-8')));

let app: App;

beforeAll(() => {
  runMigrations();
  seedOwner();
  app = createApp();
});

describe('Re-scanning the same hostname with a changed payload (D8)', () => {
  it('shelves a part missing from the later scan instead of deleting it, and reuses the build', async () => {
    const firstRes = await app.request('/api/v1/imports/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(original),
    });
    const first = await firstRes.json();
    const buildId = first.summary.buildId;

    // Same host, PSU dropped: a different payloadHash, so this is a real second import, not an
    // idempotent replay. The 5 products/6 parts still present get "updated" (D8: re-scanning a
    // host updates in place); the PSU part is shelved, never deleted.
    const rescan = {
      ...original,
      components: original.components.filter((c) => c.category !== 'psu'),
    };
    const secondRes = await app.request('/api/v1/imports/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(rescan),
    });
    expect(secondRes.status).toBe(201);
    const second = await secondRes.json();
    expect(second.summary).toMatchObject({
      buildId,
      productsCreated: 0,
      productsUpdated: 5,
      partsCreated: 0,
      partsUpdated: 6,
      partsShelved: 1,
    });

    const buildsListRes = await app.request('/api/v1/builds');
    expect(await buildsListRes.json()).toHaveLength(1); // reused, not a second build

    const buildRes = await app.request(`/api/v1/builds/${buildId}`);
    const build = await buildRes.json();
    expect(build.items).toHaveLength(6);

    const partsRes = await app.request('/api/v1/parts');
    const parts: Array<{ status: string; product: { category: string } }> = await partsRes.json();
    expect(parts).toHaveLength(7); // still 7 parts total — the PSU part was shelved, not deleted
    const psuPart = parts.find((p) => p.product.category === 'psu');
    expect(psuPart?.status).toBe('on_shelf');
  });
});
