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

async function createPart(productId: string) {
  const res = await app.request('/api/v1/parts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  return res.json();
}

async function createBuild(body: Record<string, unknown> = { name: 'Test Build' }) {
  const res = await app.request('/api/v1/builds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

describe('POST /api/v1/builds', () => {
  it('generates a D7 slug, defaults visibility=unlisted and source=manual', async () => {
    const { res, body } = await createBuild({ name: 'My New Build' });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ name: 'My New Build', visibility: 'unlisted', source: 'manual' });
    expect(body.slug).toMatch(/^[a-z2-7]{10}$/);
  });

  it('accepts an explicit visibility', async () => {
    const { body } = await createBuild({ name: 'Private Build', visibility: 'private' });
    expect(body.visibility).toBe('private');
  });

  it('requires a token when API_TOKEN is set (D3)', async () => {
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request('/api/v1/builds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Nope' }),
      });
      expect(unauthed.status).toBe(401);

      const authed = await app.request('/api/v1/builds', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ name: 'Yep' }),
      });
      expect(authed.status).toBe(201);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('PATCH /api/v1/builds/{id}', () => {
  it('updates name, description and visibility', async () => {
    const { body: build } = await createBuild();
    const res = await app.request(`/api/v1/builds/${build.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Renamed',
        description: 'now with a description',
        visibility: 'public',
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: 'Renamed',
      description: 'now with a description',
      visibility: 'public',
    });
  });

  it('a duplicate slug is a 409, not a 500', async () => {
    const { body: a } = await createBuild({ name: 'Build A' });
    const { body: b } = await createBuild({ name: 'Build B' });

    const res = await app.request(`/api/v1/builds/${b.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: a.slug }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('slug_conflict');
  });

  it('a user-supplied slug that is free is accepted (D7) — this is what makes the §8 private→404 step performable via visibility', async () => {
    const { body: build } = await createBuild();
    const res = await app.request(`/api/v1/builds/${build.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'my-custom-slug', visibility: 'private' }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.slug).toBe('my-custom-slug');
    expect(updated.visibility).toBe('private');

    // private -> share route 404s (visibility definitely works, per the brief).
    const shareRes = await app.request(`/api/v1/share/${updated.slug}`);
    expect(shareRes.status).toBe(404);
  });

  it('404s for an unknown build', async () => {
    const res = await app.request('/api/v1/builds/does-not-exist', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    expect(res.status).toBe(404);
  });

  it('requires a token when API_TOKEN is set (D3)', async () => {
    const { body: build } = await createBuild();
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/builds/${build.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'nope' }),
      });
      expect(unauthed.status).toBe(401);

      const authed = await app.request(`/api/v1/builds/${build.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ name: 'yep' }),
      });
      expect(authed.status).toBe(200);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('POST /api/v1/builds/{id}/items', () => {
  it('adds a part to a build and marks it in_build', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: build } = await createBuild();

    const res = await app.request(`/api/v1/builds/${build.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id, slot: 'DIMM_A1' }),
    });
    expect(res.status).toBe(201);
    const item = await res.json();
    expect(item).toMatchObject({ buildId: build.id, partId: part.id, slot: 'DIMM_A1' });
    expect(item.part.status).toBe('in_build');

    const getPart = await app.request(`/api/v1/parts/${part.id}`);
    expect((await getPart.json()).status).toBe('in_build');
  });

  it('404s for an unknown build or an unknown part', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: build } = await createBuild();

    const unknownBuild = await app.request('/api/v1/builds/does-not-exist/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id }),
    });
    expect(unknownBuild.status).toBe(404);

    const unknownPart = await app.request(`/api/v1/builds/${build.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: 'does-not-exist' }),
    });
    expect(unknownPart.status).toBe(404);
  });

  it('409s a part already in another build, and the body names the current buildId', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: buildA } = await createBuild({ name: 'Build A' });
    const { body: buildB } = await createBuild({ name: 'Build B' });

    const first = await app.request(`/api/v1/builds/${buildA.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id }),
    });
    expect(first.status).toBe(201);

    const second = await app.request(`/api/v1/builds/${buildB.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id }),
    });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.details).toMatchObject({ buildId: buildA.id });
  });

  it('requires a token when API_TOKEN is set (D3)', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: build } = await createBuild();
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/builds/${build.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partId: part.id }),
      });
      expect(unauthed.status).toBe(401);

      const authed = await app.request(`/api/v1/builds/${build.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer secret-token' },
        body: JSON.stringify({ partId: part.id }),
      });
      expect(authed.status).toBe(201);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('DELETE /api/v1/builds/{id}/items/{partId}', () => {
  it('removes the item; the part still exists and is now on_shelf', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: build } = await createBuild();
    await app.request(`/api/v1/builds/${build.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id }),
    });

    const res = await app.request(`/api/v1/builds/${build.id}/items/${part.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true });

    const getPart = await app.request(`/api/v1/parts/${part.id}`);
    const partBody = await getPart.json();
    expect(partBody.status).toBe('on_shelf');

    const getBuild = await app.request(`/api/v1/builds/${build.id}`);
    expect((await getBuild.json()).items).toEqual([]);
  });

  it('404s for an unknown build, an unknown part, and a part not in that build', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: build } = await createBuild();

    const unknownBuild = await app.request(`/api/v1/builds/does-not-exist/items/${part.id}`, {
      method: 'DELETE',
    });
    expect(unknownBuild.status).toBe(404);

    const unknownPart = await app.request(`/api/v1/builds/${build.id}/items/does-not-exist`, {
      method: 'DELETE',
    });
    expect(unknownPart.status).toBe(404);

    // part exists but was never added to this build
    const notInBuild = await app.request(`/api/v1/builds/${build.id}/items/${part.id}`, {
      method: 'DELETE',
    });
    expect(notInBuild.status).toBe(404);
  });

  it('requires a token when API_TOKEN is set (D3)', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: build } = await createBuild();
    await app.request(`/api/v1/builds/${build.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id }),
    });

    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/builds/${build.id}/items/${part.id}`, {
        method: 'DELETE',
      });
      expect(unauthed.status).toBe(401);

      const authed = await app.request(`/api/v1/builds/${build.id}/items/${part.id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      });
      expect(authed.status).toBe(200);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('DELETE /api/v1/builds/{id}', () => {
  it('the build is gone; its parts still exist and are now status=on_shelf (never deleted)', async () => {
    const productA = insertProduct();
    const productB = insertProduct();
    const partA = await createPart(productA);
    const partB = await createPart(productB);
    const { body: build } = await createBuild();
    for (const part of [partA, partB]) {
      await app.request(`/api/v1/builds/${build.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partId: part.id }),
      });
    }

    const del = await app.request(`/api/v1/builds/${build.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(await del.json()).toEqual({ deleted: true });

    const getBuild = await app.request(`/api/v1/builds/${build.id}`);
    expect(getBuild.status).toBe(404);

    for (const part of [partA, partB]) {
      const getPart = await app.request(`/api/v1/parts/${part.id}`);
      expect(getPart.status).toBe(200);
      expect((await getPart.json()).status).toBe('on_shelf');
    }
  });

  it('404s for an unknown build', async () => {
    const res = await app.request('/api/v1/builds/does-not-exist', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('requires a token when API_TOKEN is set (D3)', async () => {
    const { body: build } = await createBuild();
    process.env.API_TOKEN = 'secret-token';
    try {
      const unauthed = await app.request(`/api/v1/builds/${build.id}`, { method: 'DELETE' });
      expect(unauthed.status).toBe(401);

      const authed = await app.request(`/api/v1/builds/${build.id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer secret-token' },
      });
      expect(authed.status).toBe(200);
    } finally {
      delete process.env.API_TOKEN;
    }
  });
});

describe('PATCH /api/v1/parts/{id} acquiredPriceCents -> GET /builds/{id}/valuation acquiredCents (paid-vs-now, end to end)', () => {
  it('setting acquiredPriceCents on a build part is reflected in the valuation acquiredCents', async () => {
    const productId = insertProduct();
    const part = await createPart(productId);
    const { body: build } = await createBuild({ name: 'Paid-vs-now Build' });
    await app.request(`/api/v1/builds/${build.id}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: part.id }),
    });

    const before = await app.request(`/api/v1/builds/${build.id}/valuation`);
    expect((await before.json()).acquiredCents).toBe(0);

    const patchRes = await app.request(`/api/v1/parts/${part.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ acquiredPriceCents: 15_000 }),
    });
    expect(patchRes.status).toBe(200);

    const after = await app.request(`/api/v1/builds/${build.id}/valuation`);
    expect(after.status).toBe(200);
    const afterBody = await after.json();
    expect(afterBody.acquiredCents).toBe(15_000);
  });
});
