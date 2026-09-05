/**
 * Money display formatting — the one place `SharedBuild`'s integer-minor-units values (D6) are
 * turned into strings. This *is* "the edge": no float arithmetic happens upstream of this file,
 * only here, for display.
 *
 * `SharedBuild` (§4) carries no currency field — it is single-owner in v1 and every money column
 * in the schema defaults to `USD` (`parts.acquiredCurrency`) — so both exports assume USD. If a
 * later milestone adds multi-currency owners, this is the file to change (see the brief's
 * Follow-ups).
 */
const CURRENCY = 'USD';
const LOCALE = 'en-US';

export function formatCents(cents: number): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(
    cents / 100,
  );
}

/** `+$149.98` / `-$149.98` / `$0.00` (no sign for exactly zero). */
export function formatSignedCents(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${formatCents(Math.abs(cents))}`;
}

/** `+8.6%` / `-8.6%` / `0.0%`. */
export function formatSignedPercent(pct: number): string {
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

/** `undefined` when `acquiredCents` is 0 — never divide by zero, never fake a percent. */
export function deltaPercent(acquiredCents: number, deltaCents: number): number | undefined {
  if (acquiredCents === 0) return undefined;
  return (deltaCents / acquiredCents) * 100;
}
