import type { HarnessCheck, Json } from '../types.js';

/**
 * F7/D17 regression check. Runs after `30-pricing.ts` (quotes exist — `valuation.currentCents > 0`)
 * and before `35-cost-basis.ts` (which PATCHes a real cost basis onto >= 2 parts) — the filename
 * prefix `32` is load-sensitive (checks run in filename order, CLAUDE.md), and this window is
 * exactly the state that used to render `Paid $0.00` instead of `—`: a freshly-imported scan never
 * carries a cost basis, so `coverage.withAcquired` is genuinely 0 here.
 *
 * Finds its own slug the same way `40-web.ts` does — `ctx.state.slug` isn't set until
 * `50-builds.ts`, which hasn't run yet at this point in the sequence.
 */
export default {
  id: 'no-cost-basis-yet',
  async run(ctx) {
    const buildsRes = await fetch(`${ctx.apiUrl}/api/v1/builds`);
    if (buildsRes.status !== 200) {
      ctx.fail(`GET /builds returned ${buildsRes.status}, expected 200 (needed a slug)`);
      return;
    }
    const builds: Json = await buildsRes.json();
    if (!Array.isArray(builds) || builds.length === 0) {
      ctx.fail('no builds returned by the API; cannot check the pre-cost-basis D17 state');
      return;
    }
    const slug: string = builds[0].slug;

    const jsonRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}`);
    if (jsonRes.status !== 200) {
      ctx.fail(`GET /share/${slug} returned ${jsonRes.status}, expected 200`);
      return;
    }
    const shared: Json = await jsonRes.json();
    const withAcquired = shared.valuation?.coverage?.withAcquired;
    if (withAcquired !== 0) {
      ctx.fail(
        `share JSON coverage.withAcquired=${withAcquired}, expected 0 at this point in the run ` +
          '(no cost basis has been PATCHed onto any part yet — did check ordering change?)',
      );
      return;
    }

    const mdRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}.md`);
    if (mdRes.status !== 200) {
      ctx.fail(`GET /share/${slug}.md returned ${mdRes.status}, expected 200`);
      return;
    }
    const md = await mdRes.text();
    const paidRow = md.split('\n').find((line) => line.includes('**Paid**'));
    if (!paidRow) {
      ctx.fail('share.md has no **Paid** row to check (expected one — valuation is present)');
      return;
    }
    if (!paidRow.includes('—')) {
      ctx.fail(`share.md Paid row does not render — (F7/D17 regression): ${paidRow.trim()}`);
    }
    if (paidRow.includes('$0.00')) {
      ctx.fail(
        `share.md Paid row renders $0.00 instead of — (F7/D17 regression): ${paidRow.trim()}`,
      );
    }

    ctx.state.detail = `coverage.withAcquired=0 confirmed; share.md Paid row = "${paidRow.trim()}"`;
  },
} satisfies HarnessCheck;
