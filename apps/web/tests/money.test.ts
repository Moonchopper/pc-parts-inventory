import { describe, expect, it } from 'vitest';
import {
  deltaClass,
  deltaDirection,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from '../src/lib/money.js';

describe('formatMoney', () => {
  it('formats positive minor units as major-unit currency', () => {
    expect(formatMoney(123456, 'USD')).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });

  it('formats negative minor units', () => {
    expect(formatMoney(-500, 'USD')).toBe('-$5.00');
  });

  it('respects a different ISO-4217 currency', () => {
    expect(formatMoney(1000, 'EUR')).toBe('€10.00');
  });
});

describe('formatSignedMoney', () => {
  it('prefixes a rise with + and a drop with -', () => {
    expect(formatSignedMoney(14998, 'USD')).toBe('+$149.98');
    expect(formatSignedMoney(-14998, 'USD')).toBe('-$149.98');
    expect(formatSignedMoney(0, 'USD')).toBe('$0.00');
  });

  it('respects a different ISO-4217 currency', () => {
    expect(formatSignedMoney(1000, 'EUR')).toBe('+€10.00');
  });
});

describe('deltaDirection / deltaClass', () => {
  it('is positive for a gain', () => {
    expect(deltaDirection(100)).toBe('positive');
    expect(deltaClass(100)).toBe('delta-positive');
  });

  it('is negative for a loss', () => {
    expect(deltaDirection(-100)).toBe('negative');
    expect(deltaClass(-100)).toBe('delta-negative');
  });

  it('is flat for no change', () => {
    expect(deltaDirection(0)).toBe('flat');
    expect(deltaClass(0)).toBe('delta-flat');
  });
});

describe('formatPercent', () => {
  it('prefixes a plus sign for gains', () => {
    expect(formatPercent(12.34)).toBe('+12.3%');
  });

  it('keeps the native minus sign for losses', () => {
    expect(formatPercent(-5)).toBe('-5.0%');
  });

  it('has no sign for zero', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });
});
