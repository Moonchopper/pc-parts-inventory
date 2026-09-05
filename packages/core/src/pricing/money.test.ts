import { describe, expect, it } from 'vitest';
import { parsePriceToCents } from './money.js';

// The exact cases named in the brief's Recon (D6): "0.10", "249.99", "1049.00", "1,299.99",
// 249.99 (number), and a missing/null price.
describe('parsePriceToCents (D6 — integer minor units, never a float)', () => {
  it.each([
    ['0.10', 10],
    ['249.99', 24999],
    ['1049.00', 104900],
    ['1,299.99', 129999],
  ])('parses %s as %d cents', (input, expected) => {
    expect(parsePriceToCents(input)).toBe(expected);
  });

  it('parses a JSON number the same as its decimal string form', () => {
    // Guards against the `Math.round(x * 100)` float trap this function exists to avoid.
    expect(parsePriceToCents(249.99)).toBe(24999);
    expect(parsePriceToCents(29.99)).toBe(2999);
  });

  it('returns null for a missing price', () => {
    expect(parsePriceToCents(null)).toBeNull();
    expect(parsePriceToCents(undefined)).toBeNull();
  });

  it('returns null for a non-numeric or negative string', () => {
    expect(parsePriceToCents('call for price')).toBeNull();
    expect(parsePriceToCents('-5.00')).toBeNull();
    expect(parsePriceToCents('')).toBeNull();
  });

  it('rounds half-up beyond two fractional digits', () => {
    expect(parsePriceToCents('1.005')).toBe(101);
    expect(parsePriceToCents('1.004')).toBe(100);
  });

  it('handles a whole-dollar amount with no fractional part', () => {
    expect(parsePriceToCents('42')).toBe(4200);
  });
});
