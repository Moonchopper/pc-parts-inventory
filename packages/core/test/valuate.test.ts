import { describe, expect, it } from 'vitest';
import { valuate } from '../src/valuate.js';

describe('valuate', () => {
  it('prefers manual over used_market/new_retail/msrp (D5)', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        {
          partId: 'part_1',
          quantity: 1,
          acquiredCents: 10000,
          quotes: [
            {
              kind: 'msrp',
              priceCents: 12000,
              currency: 'USD',
              observedAt: '2026-08-01T00:00:00Z',
              provider: 'fixture',
            },
            {
              kind: 'new_retail',
              priceCents: 11000,
              currency: 'USD',
              observedAt: '2026-08-20T00:00:00Z',
              provider: 'fixture',
            },
            {
              kind: 'used_market',
              priceCents: 9000,
              currency: 'USD',
              observedAt: '2026-08-25T00:00:00Z',
              provider: 'fixture',
            },
            {
              kind: 'manual',
              priceCents: 8000,
              currency: 'USD',
              observedAt: '2026-08-10T00:00:00Z',
              provider: 'owner',
            },
          ],
        },
      ],
    });
    expect(result.items[0]?.currentCents).toBe(8000);
    expect(result.items[0]?.quote?.kind).toBe('manual');
  });

  it('falls back through the precedence order when a kind is absent', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        {
          partId: 'part_1',
          quantity: 1,
          acquiredCents: 10000,
          quotes: [
            {
              kind: 'msrp',
              priceCents: 12000,
              currency: 'USD',
              observedAt: '2026-08-01T00:00:00Z',
              provider: 'fixture',
            },
            {
              kind: 'new_retail',
              priceCents: 11000,
              currency: 'USD',
              observedAt: '2026-08-20T00:00:00Z',
              provider: 'fixture',
            },
          ],
        },
      ],
    });
    expect(result.items[0]?.quote?.kind).toBe('new_retail');
  });

  it('takes the latest quote within the winning kind and computes ageDays', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        {
          partId: 'part_1',
          quantity: 1,
          acquiredCents: 10000,
          quotes: [
            {
              kind: 'used_market',
              priceCents: 7000,
              currency: 'USD',
              observedAt: '2026-08-01T00:00:00Z',
              provider: 'fixture',
            },
            {
              kind: 'used_market',
              priceCents: 7500,
              currency: 'USD',
              observedAt: '2026-08-26T00:00:00Z',
              provider: 'fixture',
            },
          ],
        },
      ],
    });
    expect(result.items[0]?.currentCents).toBe(7500);
    expect(result.items[0]?.quote?.ageDays).toBe(10);
  });

  it('multiplies the chosen quote by quantity — priceCents is per-unit, currentCents is the row total', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        {
          partId: 'part_1',
          quantity: 3,
          acquiredCents: 30000, // total for all 3, not per-unit
          quotes: [
            {
              kind: 'used_market',
              priceCents: 9000, // per-unit
              currency: 'USD',
              observedAt: '2026-09-01T00:00:00Z',
              provider: 'fixture',
            },
          ],
        },
      ],
    });
    expect(result.items[0]?.currentCents).toBe(27000); // 9000 * 3
    expect(result.currentCents).toBe(27000);
  });

  it('D5 revised (2026-09-05, architect): no fallback — sums acquired vs current independently, over different item sets', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        {
          partId: 'a',
          quantity: 1,
          acquiredCents: 10000,
          quotes: [
            {
              kind: 'used_market',
              priceCents: 8000,
              currency: 'USD',
              observedAt: '2026-09-01T00:00:00Z',
              provider: 'x',
            },
          ],
        },
        // No quote at all — must NOT fall back to acquiredCents as "current". This is the exact
        // reproduction the PM filed: previously `currentCents` silently became 13000 (8000 + the
        // 5000 fallback) instead of 8000.
        { partId: 'b', quantity: 1, acquiredCents: 5000, quotes: [] },
      ],
    });
    expect(result.acquiredCents).toBe(15000);
    expect(result.currentCents).toBe(8000);
    expect(result.comparable.items).toBe(1);
    expect(result.comparable.acquiredCents).toBe(10000);
    expect(result.comparable.currentCents).toBe(8000);
    expect(result.comparable.deltaCents).toBe(-2000);
    expect(result.comparable.deltaPct).toBeCloseTo(-20.0, 1);
    expect(result.coverage.items).toBe(2);
    expect(result.coverage.withAcquired).toBe(2);
    expect(result.coverage.withCurrent).toBe(1);
    // Item 'b' has no current value at all — never a substituted acquired price.
    expect(result.items[1]?.currentCents).toBeUndefined();
  });

  it('a quoted-but-no-cost-basis row contributes to currentCents/coverage.withCurrent but not to comparable', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        {
          partId: 'unpriced-basis',
          quantity: 1,
          acquiredCents: null, // no cost basis — e.g. scanned hardware never PATCHed with a price
          quotes: [
            {
              kind: 'new_retail',
              priceCents: 6000,
              currency: 'USD',
              observedAt: '2026-09-01T00:00:00Z',
              provider: 'fixture',
            },
          ],
        },
      ],
    });
    expect(result.acquiredCents).toBe(0);
    expect(result.currentCents).toBe(6000);
    expect(result.coverage.items).toBe(1);
    expect(result.coverage.withAcquired).toBe(0);
    expect(result.coverage.withCurrent).toBe(1);
    expect(result.comparable.items).toBe(0);
    expect(result.comparable.acquiredCents).toBe(0);
    expect(result.comparable.currentCents).toBe(0);
    expect(result.comparable.deltaCents).toBe(0);
    // No comparable items at all — never a fake 0%/NaN, `null` says "not applicable".
    expect(result.comparable.deltaPct).toBeNull();
    expect(result.items[0]?.acquiredCents).toBeUndefined();
    expect(result.items[0]?.currentCents).toBe(6000);
  });

  it('comparable.items == 0 across the whole build yields deltaPct null, not 0 or NaN', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        { partId: 'no-quote', quantity: 1, acquiredCents: 5000, quotes: [] },
        { partId: 'no-cost-basis', quantity: 1, acquiredCents: null, quotes: [] },
      ],
    });
    expect(result.comparable.items).toBe(0);
    expect(result.comparable.deltaCents).toBe(0);
    expect(result.comparable.deltaPct).toBeNull();
  });
});
