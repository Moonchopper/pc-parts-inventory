/**
 * Text helpers shared by the Markdown table and the PNG card.
 */

/** Escapes `|` and collapses any newline so a value can never break a Markdown table row. */
export function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, ' ');
}

/** Truncates to at most `maxChars` characters, replacing the tail with a single `…` when cut. */
export function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return value.slice(0, Math.max(maxChars, 0));
  return `${value.slice(0, maxChars - 1)}…`;
}
