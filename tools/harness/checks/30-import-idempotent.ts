import type { HarnessCheck, Json } from '../types.js';

export default {
  id: 'import-idempotent',
  async run(ctx) {
    const res = await fetch(`${ctx.apiUrl}/api/v1/imports/scans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ctx.fixture),
    });
    if (res.status !== 200) {
      ctx.fail(`second identical POST /imports/scans returned ${res.status}, expected 200`);
      return;
    }
    const body: Json = await res.json();
    if (body.id !== ctx.state.importId) {
      ctx.fail(`second POST created a new import (${body.id} !== ${ctx.state.importId})`);
      return;
    }
    // `summary` is a historical record of the *original* processing (productsCreated=6,
    // partsCreated=7 for scan.sample.json) — a replay returns the same stored row, not a
    // "nothing changed this time" delta. The proof that the replay was a no-op is the row counts
    // checked below, not this summary being zeroed out.
    if (
      body.summary?.productsCreated !== ctx.counters.productsCreated ||
      body.summary?.partsCreated !== ctx.counters.partsCreated
    ) {
      ctx.fail(`replay returned a different stored summary: ${JSON.stringify(body.summary)}`);
      return;
    }

    const productsRes = await fetch(`${ctx.apiUrl}/api/v1/products`);
    const products: Json = await productsRes.json();
    const partsRes = await fetch(`${ctx.apiUrl}/api/v1/parts`);
    const parts: Json = await partsRes.json();
    if (
      products.length !== ctx.counters.productsCreated ||
      parts.length !== ctx.counters.partsCreated
    ) {
      ctx.fail(
        `row counts changed after replay: products=${products.length} parts=${parts.length}, expected ${ctx.counters.productsCreated}/${ctx.counters.partsCreated}`,
      );
      return;
    }

    ctx.counters.importsIdempotent = true;
    ctx.state.detail = `POST /imports/scans (replay) -> 200, same import id, no new rows (products=${products.length}, parts=${parts.length})`;
  },
} satisfies HarnessCheck;
