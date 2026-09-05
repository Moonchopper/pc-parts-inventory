import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScanPayload } from '@pcpi/contracts';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import type { App } from '../../src/app.js';
import { createApp } from '../../src/app.js';
import { getDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { builds } from '../../src/db/schema.js';
import { seedOwner } from '../../src/db/seed.js';

// Isolated DB for this test file (vitest gives each file its own module instance) — no network.
process.env.DATABASE_URL = ':memory:';
delete process.env.API_TOKEN;

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../../../packages/contracts/fixtures/scan.sample.json');
const fixture = ScanPayload.parse(JSON.parse(readFileSync(fixturePath, 'utf-8')));

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KNOWN_SERIALS = ['GPU-SN-0001', 'MEM-SN-AAA', 'MEM-SN-BBB', 'STORAGE-SN-0001'];

let app: App;
let slug: string;
let buildId: string;

beforeAll(async () => {
  runMigrations();
  seedOwner();
  app = createApp();

  await app.request('/api/v1/imports/scans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fixture),
  });
  const list = await (await app.request('/api/v1/builds')).json();
  slug = list[0].slug;
  buildId = list[0].id;
});

describe('GET /api/v1/share/{slug}.md', () => {
  it('returns text/markdown with one row per share-JSON item and no serial/note leaks', async () => {
    const shareJson = await (await app.request(`/api/v1/share/${slug}`)).json();

    const res = await app.request(`/api/v1/share/${slug}.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');

    const md = await res.text();
    const dataRows = md
      .split('\n')
      .filter((l) => l.trim().startsWith('|'))
      .filter((l) => !/^\|\s*-+\s*\|/.test(l.trim()))
      .filter((l) => !l.includes('Type') || !l.includes('Item'))
      .filter((l) => !l.includes('**'));
    expect(dataRows.length).toBe(shareJson.items.length);

    for (const serial of KNOWN_SERIALS) {
      expect(md).not.toContain(serial);
    }
    expect(md.toLowerCase()).not.toContain('notes');

    for (const component of fixture.components) {
      expect(md).toContain(component.model);
    }
  });

  it('404s for an unknown slug with the §4 error shape', async () => {
    const res = await app.request('/api/v1/share/does-not-exist.md');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
  });

  it('404s for a private build', async () => {
    getDb().update(builds).set({ visibility: 'private' }).where(eq(builds.id, buildId)).run();
    try {
      const res = await app.request(`/api/v1/share/${slug}.md`);
      expect(res.status).toBe(404);
    } finally {
      getDb().update(builds).set({ visibility: 'unlisted' }).where(eq(builds.id, buildId)).run();
    }
  });
});

describe('GET /api/v1/share/{slug}/card.png', () => {
  it('returns a PNG over 10000 bytes with the right content-type and an ETag', async () => {
    const res = await app.request(`/api/v1/share/${slug}/card.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('max-age=60');
    const etag = res.headers.get('etag');
    expect(etag).toBeTruthy();

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(buf.length).toBeGreaterThan(10_000);
  });

  it('returns 304 when If-None-Match matches the current ETag', async () => {
    const first = await app.request(`/api/v1/share/${slug}/card.png`);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await app.request(`/api/v1/share/${slug}/card.png`, {
      headers: { 'if-none-match': etag ?? '' },
    });
    expect(second.status).toBe(304);
  });

  it('404s for an unknown slug', async () => {
    const res = await app.request('/api/v1/share/does-not-exist/card.png');
    expect(res.status).toBe(404);
  });

  it('404s for a private build', async () => {
    getDb().update(builds).set({ visibility: 'private' }).where(eq(builds.id, buildId)).run();
    try {
      const res = await app.request(`/api/v1/share/${slug}/card.png`);
      expect(res.status).toBe(404);
    } finally {
      getDb().update(builds).set({ visibility: 'unlisted' }).where(eq(builds.id, buildId)).run();
    }
  });
});

describe('GET /api/v1/share/{slug} (JSON) — unaffected by the new routes', () => {
  it('still returns 200 with the full item set (routing did not regress)', async () => {
    const res = await app.request(`/api/v1/share/${slug}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/share/{slug} — currency (Task 1, architect 2026-09-05)', () => {
  it('carries a non-empty ISO-4217 currency string', async () => {
    const res = await app.request(`/api/v1/share/${slug}`);
    const body = await res.json();
    expect(typeof body.currency).toBe('string');
    expect(body.currency.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/share/{slug} — deterministic item order (Task 3, architect 2026-09-05)', () => {
  it('returns identical item arrays across two consecutive requests — deep-equal, not just same length', async () => {
    const first = await (await app.request(`/api/v1/share/${slug}`)).json();
    const second = await (await app.request(`/api/v1/share/${slug}`)).json();
    expect(first.items.length).toBeGreaterThan(1);
    expect(second.items).toEqual(first.items);
  });
});
