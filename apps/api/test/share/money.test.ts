import { describe, expect, it } from 'vitest';
import {
  deltaPercent,
  formatCents,
  formatSignedCents,
  formatSignedPercent,
} from '../../src/share/money.js';

describe('formatCents', () => {
  it('formats integer minor units as USD (D6: display only at the edge)', () => {
    expect(formatCents(47900)).toBe('$479.00');
    expect(formatCents(18999)).toBe('$189.99');
    expect(formatCents(0)).toBe('$0.00');
  });
});

describe('formatSignedCents', () => {
  it('prefixes a rise with + and a drop with -', () => {
    expect(formatSignedCents(14998)).toBe('+$149.98');
    expect(formatSignedCents(-14998)).toBe('-$149.98');
    expect(formatSignedCents(0)).toBe('$0.00');
  });
});

describe('formatSignedPercent', () => {
  it('signs the percent to match the delta direction', () => {
    expect(formatSignedPercent(8.6)).toBe('+8.6%');
    expect(formatSignedPercent(-8.6)).toBe('-8.6%');
    expect(formatSignedPercent(0)).toBe('0.0%');
  });
});

describe('deltaPercent', () => {
  it('computes a signed percent of the acquired price', () => {
    expect(deltaPercent(175000, 14998)).toBeCloseTo(8.5703, 3);
  });

  it('returns undefined rather than dividing by zero when nothing was paid', () => {
    expect(deltaPercent(0, 500)).toBeUndefined();
  });
});
