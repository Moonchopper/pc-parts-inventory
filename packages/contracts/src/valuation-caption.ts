import type { ValuationComparable, ValuationCoverage } from './domain.js';

/**
 * The one wording for the "what does this valuation actually cover" line under Paid/Now/Δ —
 * architect-directed, 2026-09-05, presentation-only revision of the polish brief's Task 7 caption.
 *
 * Why this exists: `Paid`/`Now` are sums over *different, possibly non-overlapping* item sets (D5
 * no-fallback — see `Valuation` above), so `Paid − Now` does not equal `Δ` in general, and a reader
 * who does that subtraction in their head gets a number that looks wrong even though every figure
 * on the card is individually correct. The caption makes the mismatch legible instead of silent by
 * naming exactly which parts fed which number, using **only** `coverage`/`comparable` fields that
 * are already on the wire — never recomputed from the two top-level totals (that recomputation is
 * exactly the D5 fallback bug in a different spot).
 *
 * Single source of truth for all four surfaces that show this line (the PNG card, the Markdown
 * export, the share page, the build detail page) — every one of them calls this function directly
 * rather than re-deriving the wording, so the four can never drift out of step with each other.
 *
 * Deliberately spells out "delta" rather than using the "Δ" glyph: the PNG card renders through a
 * Latin-only embedded font subset (`apps/api/assets/inter-latin-*.woff`), and a character it can't
 * draw becomes a silent tofu box, not an error — the exact failure mode `card.ts` already documents
 * for the `→` arrow glyph it avoids for the same reason. One wording shared by all four surfaces
 * means it must be safe on the least capable one.
 */
/** F12 — "1 part" / "2 parts": every count in this caption pluralizes its own noun independently. */
function partsNoun(count: number): string {
  return count === 1 ? 'part' : 'parts';
}

export function valuationCaption(v: {
  comparable: Pick<ValuationComparable, 'items'>;
  coverage: Pick<ValuationCoverage, 'withCurrent' | 'items'>;
}): string {
  const { comparable, coverage } = v;

  if (coverage.withCurrent === 0) {
    return 'No prices yet · add a provider or refresh';
  }

  if (comparable.items === 0) {
    return `Now covers ${coverage.withCurrent} of ${coverage.items} ${partsNoun(coverage.items)} · no part has both a cost basis and a price yet`;
  }

  return `Now covers ${coverage.withCurrent} of ${coverage.items} ${partsNoun(coverage.items)} · delta over the ${comparable.items} ${partsNoun(comparable.items)} with both a cost basis and a price`;
}
