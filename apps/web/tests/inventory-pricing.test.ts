import type { Valuation, ValuationItem } from '@pcpi/contracts';
import { describe, expect, it } from 'vitest';
import { indexValuationsByPart } from '../src/lib/inventory-pricing.js';

function valuationItem(overrides: Partial<ValuationItem> = {}): ValuationItem {
  return { partId: 'part_1', quantity: 1, ...overrides };
}

function valuation(overrides: Partial<Valuation> = {}): Valuation {
  return {
    buildId: 'build_1',
    currency: 'USD',
    acquiredCents: 0,
    currentCents: 0,
    comparable: { items: 0, acquiredCents: 0, currentCents: 0, deltaCents: 0, deltaPct: null },
    coverage: { items: 0, withAcquired: 0, withCurrent: 0 },
    items: [],
    ...overrides,
  };
}

describe('indexValuationsByPart', () => {
  it('maps a part with both acquired and current onto its partId', () => {
    const index = indexValuationsByPart([
      valuation({
        items: [valuationItem({ partId: 'part_1', acquiredCents: 10000, currentCents: 9000 })],
      }),
    ]);
    expect(index.part_1).toEqual({ currency: 'USD', acquiredCents: 10000, currentCents: 9000 });
  });

  it('omits acquiredCents/currentCents individually when the item lacks them (no fallback)', () => {
    const index = indexValuationsByPart([
      valuation({ items: [valuationItem({ partId: 'no-quote', acquiredCents: 5000 })] }),
    ]);
    expect(index['no-quote']).toEqual({ currency: 'USD', acquiredCents: 5000 });
    expect(index['no-quote'].currentCents).toBeUndefined();
  });

  it('merges items from multiple builds into one index', () => {
    const index = indexValuationsByPart([
      valuation({ buildId: 'b1', items: [valuationItem({ partId: 'a', currentCents: 1000 })] }),
      valuation({ buildId: 'b2', items: [valuationItem({ partId: 'b', currentCents: 2000 })] }),
    ]);
    expect(index.a.currentCents).toBe(1000);
    expect(index.b.currentCents).toBe(2000);
  });

  it('skips a null valuation (a 404 or unavailable build) without throwing', () => {
    const index = indexValuationsByPart([
      null,
      valuation({ items: [valuationItem({ partId: 'a', currentCents: 1000 })] }),
    ]);
    expect(Object.keys(index)).toEqual(['a']);
  });

  it('a part in no build is simply absent from the index — the page must render it as "—", never invent a price', () => {
    const index = indexValuationsByPart([
      valuation({ items: [valuationItem({ partId: 'in-a-build', currentCents: 1000 })] }),
    ]);
    expect(index['on-the-shelf']).toBeUndefined();
  });

  it('returns an empty index for no builds at all', () => {
    expect(indexValuationsByPart([])).toEqual({});
  });
});
