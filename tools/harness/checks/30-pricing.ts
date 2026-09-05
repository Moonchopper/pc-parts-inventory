import type { HarnessCheck, Json } from '../types.js';

/**
 * D11/D5 integration check (W0.3). Runs after `20-import-scan.ts` (needs `ctx.state.buildId`).
 * With `PRICING_PROVIDERS` unset — the API defaults to `fixture` (Deliverable 1), matching the
 * brief's "with PRICING_PROVIDERS=fixture" scenario without the harness needing to set it — this
 * enqueues a `price_refresh` job per imported product, runs the job loop once via
 * `POST /jobs/run-due` (HARNESS=1, so that endpoint exists), and asserts D11/D5 outcomes:
 * `quotesRecorded >= 1` per fixture-matched product and `>= 2` overall, plus a `GET
 * /builds/{buildId}/valuation` with `currentCents > 0` and `deltaCents === currentCents -
 * acquiredCents`. `packages/core/fixtures/quotes.json` is authored to match products from both
 * `packages/contracts/fixtures/scan.sample.json` (the default fixture this harness run imports)
 * and the real `tools/scanner/fixtures/MOONPC.redacted.json` scan (for the PM's `--fixture` run and
 * the §7 integration gate), so this check passes regardless of which one produced `ctx.fixture`.
 */
export default {
  id: 'pricing',
  async run(ctx) {
    const buildId = ctx.state.buildId as string | undefined;
    if (!buildId) {
      ctx.fail('no buildId in state (the import-scan check must run first)');
      return;
    }

    const productsRes = await fetch(`${ctx.apiUrl}/api/v1/products`);
    if (productsRes.status !== 200) {
      ctx.fail(`GET /products returned ${productsRes.status}, expected 200`);
      return;
    }
    const productList: Json = await productsRes.json();
    if (!Array.isArray(productList) || productList.length === 0) {
      ctx.fail('GET /products returned no products to refresh');
      return;
    }

    for (const product of productList) {
      const res = await fetch(`${ctx.apiUrl}/api/v1/products/${product.id}/refresh`, {
        method: 'POST',
      });
      if (res.status !== 202) {
        ctx.fail(`POST /products/${product.id}/refresh returned ${res.status}, expected 202`);
        return;
      }
    }

    const runDueRes = await fetch(`${ctx.apiUrl}/api/v1/jobs/run-due`, { method: 'POST' });
    if (runDueRes.status !== 200) {
      ctx.fail(`POST /jobs/run-due returned ${runDueRes.status}, expected 200`);
      return;
    }

    let totalQuotes = 0;
    let productsWithQuotes = 0;
    for (const product of productList) {
      const quotesRes = await fetch(`${ctx.apiUrl}/api/v1/products/${product.id}/quotes`);
      const quotes: Json = await quotesRes.json();
      if (Array.isArray(quotes) && quotes.length > 0) {
        productsWithQuotes += 1;
        totalQuotes += quotes.length;
      }
    }
    ctx.counters.quotesRecorded = totalQuotes;

    if (productsWithQuotes < 1) {
      ctx.fail(
        `the fixture provider matched 0 of ${productList.length} imported products — expected >= 1`,
      );
    }
    if (totalQuotes < 2) {
      ctx.fail(`quotesRecorded=${totalQuotes}, expected >= 2 overall`);
    }

    const valuationRes = await fetch(`${ctx.apiUrl}/api/v1/builds/${buildId}/valuation`);
    if (valuationRes.status !== 200) {
      ctx.fail(`GET /builds/${buildId}/valuation returned ${valuationRes.status}, expected 200`);
      return;
    }
    const valuation: Json = await valuationRes.json();
    ctx.counters.valuation.acquiredCents = valuation.acquiredCents ?? 0;
    ctx.counters.valuation.currentCents = valuation.currentCents ?? 0;
    ctx.counters.valuation.deltaCents = valuation.deltaCents ?? 0;

    if (!(valuation.currentCents > 0)) {
      ctx.fail(`valuation.currentCents=${valuation.currentCents}, expected > 0`);
    }
    const expectedDelta = valuation.currentCents - valuation.acquiredCents;
    if (valuation.deltaCents !== expectedDelta) {
      ctx.fail(
        `valuation.deltaCents=${valuation.deltaCents}, expected ${expectedDelta} (currentCents - acquiredCents)`,
      );
    }

    ctx.state.detail =
      `refreshed ${productList.length} products -> quotesRecorded=${totalQuotes} (${productsWithQuotes} matched the fixture provider); ` +
      `valuation acquiredCents=${valuation.acquiredCents}, currentCents=${valuation.currentCents}, deltaCents=${valuation.deltaCents}`;
  },
} satisfies HarnessCheck;
