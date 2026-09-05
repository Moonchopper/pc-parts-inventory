/**
 * Money is integer minor units + an ISO-4217 currency (CLAUDE.md conventions, D6). Formatting goes
 * through `Intl.NumberFormat` with the minor-units value divided down to major units — never a
 * hand-rolled `toFixed` string, which breaks for zero-decimal currencies and locale grouping.
 */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** `+$149.98` / `-$149.98` / `$0.00` (no sign for exactly zero) — for a Δ figure, never a plain total. */
export function formatSignedMoney(cents: number, currency: string): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  return `${sign}${formatMoney(Math.abs(cents), currency)}`;
}

export type DeltaDirection = 'positive' | 'negative' | 'flat';

/** Sign of a delta in cents — positive means the build is worth more now than acquired. */
export function deltaDirection(deltaCents: number): DeltaDirection {
  if (deltaCents > 0) return 'positive';
  if (deltaCents < 0) return 'negative';
  return 'flat';
}

/** CSS class name for a delta value, for scoped `.delta-positive` / `.delta-negative` styles. */
export function deltaClass(deltaCents: number): string {
  return `delta-${deltaDirection(deltaCents)}`;
}

/**
 * `deltaPct` (Valuation DTO, §4) is already expressed as a percentage (e.g. `-12.5` for -12.5%),
 * not a fraction — format with a leading sign so gains and losses read unambiguously.
 */
export function formatPercent(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
