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

/**
 * D17 — a top-level valuation total (`Paid`/`Now`) dashes when its own `ValuationCoverage` count
 * (`withAcquired`/`withCurrent`) is 0, rather than rendering `formatMoney(0, …)` = `$0.00`, which
 * would misread as "this build cost nothing" instead of "nobody has recorded a price yet". `$0.00`
 * is reserved for a real recorded zero. One helper for every total on every page (share, build,
 * inventory) so the rule can't drift between them — never call `formatMoney` directly on a
 * `Valuation`/`SharedBuild.valuation` total.
 */
export function formatTotalOrDash(cents: number, currency: string, coverageCount: number): string {
  return coverageCount === 0 ? '—' : formatMoney(cents, currency);
}
