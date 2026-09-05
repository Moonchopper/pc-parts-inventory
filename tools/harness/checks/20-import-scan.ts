import type { HarnessCheck, Json } from '../types.js';

/**
 * scan.sample.json: cpu, gpu, memory x2 (same product, different serials), storage, motherboard
 * (placeholder serial), psu (placeholder serial) = 7 components, 6 products, 7 parts. Matches
 * packages/core/test/normalize.test.ts and apps/api/test/api.test.ts.
 */
const EXPECTED_PRODUCTS_CREATED = 6;
const EXPECTED_PARTS_CREATED = 7;

export default {
  id: 'import-scan',
  async run(ctx) {
    const res = await fetch(`${ctx.apiUrl}/api/v1/imports/scans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ctx.fixture),
    });
    if (res.status !== 201) {
      ctx.fail(`POST /imports/scans returned ${res.status}, expected 201`);
      return;
    }
    const body: Json = await res.json();
    ctx.state.importId = body.id;
    ctx.state.buildId = body.summary?.buildId;

    ctx.counters.productsCreated = body.summary?.productsCreated ?? 0;
    ctx.counters.productsUpdated = body.summary?.productsUpdated ?? 0;
    ctx.counters.partsCreated = body.summary?.partsCreated ?? 0;
    ctx.counters.partsUpdated = body.summary?.partsUpdated ?? 0;
    ctx.counters.partsShelved = body.summary?.partsShelved ?? 0;

    if (ctx.counters.productsCreated !== EXPECTED_PRODUCTS_CREATED) {
      ctx.fail(
        `productsCreated=${ctx.counters.productsCreated}, expected ${EXPECTED_PRODUCTS_CREATED}`,
      );
    }
    if (ctx.counters.partsCreated !== EXPECTED_PARTS_CREATED) {
      ctx.fail(`partsCreated=${ctx.counters.partsCreated}, expected ${EXPECTED_PARTS_CREATED}`);
    }

    ctx.state.detail =
      `POST /imports/scans -> 201; scan.sample.json (7 components) implies ` +
      `productsCreated=${EXPECTED_PRODUCTS_CREATED}, partsCreated=${EXPECTED_PARTS_CREATED}; got ` +
      `productsCreated=${ctx.counters.productsCreated}, partsCreated=${ctx.counters.partsCreated}`;
  },
} satisfies HarnessCheck;
