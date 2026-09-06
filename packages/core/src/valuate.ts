import type { QuoteKind, Valuation, ValuationItem } from '@pcpi/contracts';

export type ValuateQuoteInput = {
  kind: QuoteKind;
  priceCents: number;
  currency: string;
  observedAt: string;
  provider: string;
};

export type ValuateItemInput = {
  partId: string;
  /** All parts of this row (D6/§3 `parts.quantity`) — multiplies the chosen quote's per-unit price. */
  quantity: number;
  /** The *total* paid for this row across all of its `quantity` — not a per-unit price. */
  acquiredCents: number | null;
  quotes: ValuateQuoteInput[];
};

export type ValuateInput = {
  buildId: string;
  currency: string;
  items: ValuateItemInput[];
  /** Injected for deterministic tests; defaults to `new Date()`. */
  now?: Date;
};

/**
 * D5 kind precedence, highest wins. Choice (stated here, proven in valuate.test.ts): `manual` beats
 * everything — it is an explicit owner override and should never be second-guessed by a fetched
 * quote. Below that, `used_market` (what it would actually sell for today) outranks `new_retail`
 * (what a new unit costs) which outranks `msrp` (the least current number available).
 */
const KIND_PRECEDENCE: readonly QuoteKind[] = ['manual', 'used_market', 'new_retail', 'msrp'];

function pickCurrentQuote(quotes: ValuateQuoteInput[]): ValuateQuoteInput | null {
  for (const kind of KIND_PRECEDENCE) {
    const ofKind = quotes.filter((q) => q.kind === kind);
    const first = ofKind[0];
    if (!first) continue;
    return ofKind.reduce(
      (latest, q) =>
        new Date(q.observedAt).getTime() > new Date(latest.observedAt).getTime() ? q : latest,
      first,
    );
  }
  return null;
}

function ageDaysBetween(observedAt: string, now: Date): number {
  const ms = now.getTime() - new Date(observedAt).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function roundPct(deltaCents: number, acquiredCents: number): number {
  return Math.round((deltaCents / acquiredCents) * 1000) / 10;
}

/**
 * D5 — "current value" as a pure query over already-fetched quotes; D6 — integer minor units only.
 *
 * Revised 2026-09-05 (architect): **no fallback, in either direction, ever.** The previous version
 * substituted `acquiredCents` for `currentCents` when an item had no quote, so a build of entirely
 * unpriced hardware silently reported "no change" instead of "no data" — Pillar 2 promises the
 * opposite. Now an item's `currentCents` is present only when a quote exists, its `acquiredCents`
 * only when a cost basis exists, and the two totals are summed independently:
 *   - `acquiredCents` (top-level) — Σ over items with a known cost basis: "what I paid".
 *   - `currentCents` (top-level) — Σ over items with a quote: "what the priced parts are worth now".
 *   - `comparable` — the like-for-like subset having BOTH; only here does
 *     `deltaCents === currentCents - acquiredCents` hold, because only here are the two sums over
 *     the same set of items.
 *   - `coverage` — how many items contributed to each side, so callers can show "n of m priced"
 *     instead of a number that quietly means less than it looks like.
 */
export function valuate(input: ValuateInput): Valuation {
  const now = input.now ?? new Date();
  let acquiredCents = 0;
  let currentCents = 0;
  let comparableAcquiredCents = 0;
  let comparableCurrentCents = 0;
  let comparableItems = 0;
  let withAcquired = 0;
  let withCurrent = 0;

  const items: ValuationItem[] = input.items.map((item) => {
    const quote = pickCurrentQuote(item.quotes);
    const itemAcquired = item.acquiredCents; // total for the row (D6 §4 per-item semantics) — never a fallback source
    const itemCurrent = quote ? quote.priceCents * item.quantity : null; // per-unit price × quantity, no fallback

    if (itemAcquired != null) {
      acquiredCents += itemAcquired;
      withAcquired += 1;
    }
    if (itemCurrent != null) {
      currentCents += itemCurrent;
      withCurrent += 1;
    }
    if (itemAcquired != null && itemCurrent != null) {
      comparableAcquiredCents += itemAcquired;
      comparableCurrentCents += itemCurrent;
      comparableItems += 1;
    }

    return {
      partId: item.partId,
      quantity: item.quantity,
      ...(itemAcquired != null ? { acquiredCents: itemAcquired } : {}),
      ...(itemCurrent != null ? { currentCents: itemCurrent } : {}),
      ...(quote
        ? {
            quote: {
              kind: quote.kind,
              provider: quote.provider,
              observedAt: quote.observedAt,
              ageDays: ageDaysBetween(quote.observedAt, now),
            },
          }
        : {}),
    };
  });

  const comparableDeltaCents = comparableCurrentCents - comparableAcquiredCents;

  return {
    buildId: input.buildId,
    currency: input.currency,
    acquiredCents,
    currentCents,
    comparable: {
      items: comparableItems,
      acquiredCents: comparableAcquiredCents,
      currentCents: comparableCurrentCents,
      deltaCents: comparableDeltaCents,
      deltaPct:
        comparableAcquiredCents !== 0
          ? roundPct(comparableDeltaCents, comparableAcquiredCents)
          : null,
    },
    coverage: {
      items: items.length,
      withAcquired,
      withCurrent,
    },
    items,
  };
}
