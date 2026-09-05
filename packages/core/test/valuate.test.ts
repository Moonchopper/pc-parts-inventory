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

  it('sums acquired vs current across items and computes deltaCents/deltaPct', () => {
    const now = new Date('2026-09-05T00:00:00Z');
    const result = valuate({
      buildId: 'build_1',
      currency: 'USD',
      now,
      items: [
        {
          partId: 'a',
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
        { partId: 'b', acquiredCents: 5000, quotes: [] },
      ],
    });
    expect(result.acquiredCents).toBe(15000);
    expect(result.currentCents).toBe(13000);
    expect(result.deltaCents).toBe(-2000);
    expect(result.deltaPct).toBeCloseTo(-13.3, 1);
  });
});
