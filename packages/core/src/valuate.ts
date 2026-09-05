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

/** D5 — "current value" as a pure query over already-fetched quotes; D6 — integer minor units only. */
export function valuate(input: ValuateInput): Valuation {
  const now = input.now ?? new Date();
  let acquiredCents = 0;
  let currentCents = 0;

  const items: ValuationItem[] = input.items.map((item) => {
    const quote = pickCurrentQuote(item.quotes);
    const itemAcquired = item.acquiredCents ?? 0;
    const itemCurrent = quote ? quote.priceCents : itemAcquired;
    acquiredCents += itemAcquired;
    currentCents += itemCurrent;

    return {
      partId: item.partId,
      ...(item.acquiredCents != null ? { acquiredCents: item.acquiredCents } : {}),
      ...(quote ? { currentCents: quote.priceCents } : {}),
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

  const deltaCents = currentCents - acquiredCents;
  const deltaPct = acquiredCents !== 0 ? Math.round((deltaCents / acquiredCents) * 1000) / 10 : 0;

  return {
    buildId: input.buildId,
    currency: input.currency,
    acquiredCents,
    currentCents,
    deltaCents,
    deltaPct,
    items,
  };
}
