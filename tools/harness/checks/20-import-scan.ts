import type { ScanPayload } from '@pcpi/contracts';
import type { HarnessCheck, Json } from '../types.js';

/**
 * Expectations are derived from `ctx.fixture` itself, not hardcoded to scan.sample.json — this is
 * what lets the PM point `--fixture` at the real redacted scan (D15) without editing this file.
 *
 * Deliberately independent of `@pcpi/core`'s `normalizeScan`: computing the expected counts the
 * same way the API computes them would make this assertion tautological against the very code the
 * harness exists to prove. D8's identity rules, restated minimally and directly against the raw
 * ScanPayload:
 *   - one Part per ScanComponent, always -> partsCreated = components.length.
 *   - Product identity = (category, manufacturer, model, partNumber?), ignoring serial -> distinct
 *     product count = size of the set of those four fields joined per component.
 */
function expectedCounts(fixture: ScanPayload) {
  const productKeys = new Set(
    fixture.components.map(
      (c) => `${c.category}|${c.manufacturer}|${c.model}|${c.partNumber ?? ''}`,
    ),
  );
  return { products: productKeys.size, parts: fixture.components.length };
}

export default {
  id: 'import-scan',
  async run(ctx) {
    const expected = expectedCounts(ctx.fixture);

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

    if (ctx.counters.productsCreated !== expected.products) {
      ctx.fail(`productsCreated=${ctx.counters.productsCreated}, expected ${expected.products}`);
    }
    if (ctx.counters.partsCreated !== expected.parts) {
      ctx.fail(`partsCreated=${ctx.counters.partsCreated}, expected ${expected.parts}`);
    }

    ctx.state.detail =
      `POST /imports/scans -> 201; ${ctx.fixture.components.length}-component fixture implies ` +
      `productsCreated=${expected.products}, partsCreated=${expected.parts}; got ` +
      `productsCreated=${ctx.counters.productsCreated}, partsCreated=${ctx.counters.partsCreated}`;
  },
} satisfies HarnessCheck;
