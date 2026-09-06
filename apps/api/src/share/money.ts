/**
 * Money display formatting — the one place a `SharedBuild`'s integer-minor-units values (D6) are
 * turned into strings. This *is* "the edge": no float arithmetic happens upstream of this file,
 * only here, for display.
 *
 * Every export takes the currency explicitly (`SharedBuild.currency`, architect-added 2026-09-05) —
 * `Intl.NumberFormat` reads the currency *code*, not the locale, for which symbol/format to use, so
 * a fixed `en-US` locale still renders `EUR`/`JPY`/etc. correctly (falling back to the ISO code,
 * e.g. `1,234.56 XYZ`, for a currency `Intl` doesn't recognize — never a tofu box in the PNG).
 */
const LOCALE = 'en-US';

export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(cents / 100);
}

/** `+$149.98` / `-$149.98` / `$0.00` (no sign for exactly zero). */
export function formatSignedCents(cents: number, currency: string): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${formatCents(Math.abs(cents), currency)}`;
}

/** `+8.6%` / `-8.6%` / `0.0%`. */
export function formatSignedPercent(pct: number): string {
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/**
 * D17 — "no data" never renders as a number. `coverageCount` is the *count of items* backing
 * `cents` (`coverage.withAcquired` for Paid, `coverage.withCurrent` for Now) — when it is 0 there is
 * nothing to sum, and the honest answer is "no data" (`—`), not a fake `$0.00`. When a real value of
 * 0 was actually recorded (`coverageCount >= 1`), `$0.00` is correct and must still render. Both
 * `markdown.ts` and `card.ts` call this for their Paid/Now figures instead of `formatCents` directly
 * (F7 — the bug was exactly this call going straight to `formatCents` with no coverage check).
 */
export function formatTotalOrDash(cents: number, currency: string, coverageCount: number): string {
  return coverageCount === 0 ? '—' : formatCents(cents, currency);
}
