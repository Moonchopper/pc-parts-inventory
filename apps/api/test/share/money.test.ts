import { describe, expect, it } from 'vitest';
import { formatCents, formatSignedCents, formatSignedPercent } from '../../src/share/money.js';

describe('formatCents', () => {
  it('formats integer minor units as USD (D6: display only at the edge)', () => {
    expect(formatCents(47900, 'USD')).toBe('$479.00');
    expect(formatCents(18999, 'USD')).toBe('$189.99');
    expect(formatCents(0, 'USD')).toBe('$0.00');
  });

  it('formats a non-USD ISO-4217 currency correctly (Task 1/2 — currency is a required field, not a guess)', () => {
    expect(formatCents(123456, 'EUR')).toBe('€1,234.56');
  });
});

describe('formatSignedCents', () => {
  it('prefixes a rise with + and a drop with -', () => {
    expect(formatSignedCents(14998, 'USD')).toBe('+$149.98');
    expect(formatSignedCents(-14998, 'USD')).toBe('-$149.98');
    expect(formatSignedCents(0, 'USD')).toBe('$0.00');
  });

  it('respects the given currency for a non-USD amount', () => {
    expect(formatSignedCents(1000, 'EUR')).toBe('+€10.00');
    expect(formatSignedCents(-1000, 'EUR')).toBe('-€10.00');
  });
});

describe('formatSignedPercent', () => {
  it('signs the percent to match the delta direction', () => {
    expect(formatSignedPercent(8.6)).toBe('+8.6%');
    expect(formatSignedPercent(-8.6)).toBe('-8.6%');
    expect(formatSignedPercent(0)).toBe('0.0%');
  });
});
