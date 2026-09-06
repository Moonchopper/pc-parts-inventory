import type { HarnessCheck, Json } from '../types.js';

/**
 * §7 integration gate, revised 2026-09-05 (architect, Task 6) — reads money from the *artifacts*
 * (the share JSON and Markdown export), never from `GET /builds/{id}/valuation` directly. The old
 * gate asserted against that endpoint and went green while every user-visible artifact (the page,
 * the Markdown, the PNG) still rendered em-dashes — Task 4/7 fixed the underlying bug (the share
 * route never populated `valuation` at all, and `valuate()` had a fallback that hid it further);
 * this check is what proves the fix from the outside, the way a real viewer of the share page
 * would experience it.
 *
 * Must run after `35-cost-basis.ts` (PATCHes real `acquiredPriceCents` onto >= 2 parts) and after
 * `50-builds.ts` (sets `ctx.state.slug`) — filename order (`65-` after `35-`/`50-`/`60-`) enforces
 * both.
 */
function countNonDashItemPrices(md: string): number {
  return md
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .filter((line) => !/^\|\s*-+\s*\|/.test(line)) // header separator
    .filter((line) => !line.includes('Type') || !line.includes('Item')) // header row
    .filter((line) => !line.includes('**')) // bolded Paid/Now/Δ rows
    .filter((line) => !line.includes('—')).length;
}

export default {
  id: 'valuation-artifacts',
  async run(ctx) {
    const slug = ctx.state.slug as string | undefined;
    if (!slug) {
      ctx.fail('no slug in state (the builds check must run first)');
      return;
    }

    // Task 3's determinism rule, asserted the way a real consumer would notice a violation: fetch
    // the same artifact twice and deep-equal the item arrays (not just their length).
    const firstRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}`);
    if (firstRes.status !== 200) {
      ctx.fail(`GET /share/${slug} returned ${firstRes.status}, expected 200`);
      return;
    }
    const first: Json = await firstRes.json();

    const secondRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}`);
    if (secondRes.status !== 200) {
      ctx.fail(`second GET /share/${slug} returned ${secondRes.status}, expected 200`);
      return;
    }
    const second: Json = await secondRes.json();
    if (JSON.stringify(second.items) !== JSON.stringify(first.items)) {
      ctx.fail(
        'share.json.items differs across two consecutive requests (Task 3 ordering must be deterministic)',
      );
    }

    const valuation: Json = first.valuation;
    if (!valuation) {
      ctx.fail('share.json.valuation is missing entirely — the Task 4/7 fix did not populate it');
      return;
    }

    ctx.counters.valuation.acquiredCents = valuation.acquiredCents ?? 0;
    ctx.counters.valuation.currentCents = valuation.currentCents ?? 0;
    ctx.counters.valuation.deltaCents = valuation.comparable?.deltaCents ?? 0;

    if (!(valuation.acquiredCents > 0)) {
      ctx.fail(`share.json.valuation.acquiredCents=${valuation.acquiredCents}, expected > 0`);
    }
    if (!(valuation.currentCents > 0)) {
      ctx.fail(`share.json.valuation.currentCents=${valuation.currentCents}, expected > 0`);
    }
    if (!(valuation.comparable?.items >= 2)) {
      ctx.fail(
        `share.json.valuation.comparable.items=${valuation.comparable?.items}, expected >= 2`,
      );
    }
    if (valuation.comparable?.deltaCents === 0) {
      ctx.fail(
        'share.json.valuation.comparable.deltaCents is 0 — either the D5 fallback bug regressed, or ' +
          'cost-basis.json was chosen to exactly equal the fixture quote (must differ, per Task 7)',
      );
    }

    const mdRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}.md`);
    if (mdRes.status !== 200) {
      ctx.fail(`GET /share/${slug}.md returned ${mdRes.status}, expected 200`);
      return;
    }
    const md = await mdRes.text();
    const nonDashPrices = countNonDashItemPrices(md);
    if (nonDashPrices < 2) {
      ctx.fail(`share.md has ${nonDashPrices} non-dash item prices, expected >= 2`);
    }
    const hasTotalsLine = md.includes('**Paid**') && md.includes('**Now**') && md.includes('**Δ**');
    if (!hasTotalsLine) {
      ctx.fail('share.md is missing the Paid/Now/Δ totals line');
    }

    ctx.state.detail =
      `share.json.valuation: acquiredCents=${valuation.acquiredCents}, currentCents=${valuation.currentCents}, ` +
      `comparable.items=${valuation.comparable?.items}, comparable.deltaCents=${valuation.comparable?.deltaCents}; ` +
      `share.md: ${nonDashPrices} non-dash prices, totals line present; ` +
      `share.json.items identical across 2 runs (${Array.isArray(first.items) ? first.items.length : 0} items)`;
  },
} satisfies HarnessCheck;
