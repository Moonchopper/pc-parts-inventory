import type { SharedBuildItem } from '@pcpi/contracts';

/**
 * `${manufacturer} ${model}`, with a `(×N)` suffix when `quantity > 1` — shared by the Markdown
 * table and the PNG card so the two exports never disagree on how an item's name reads.
 */
export function itemDisplayName(item: SharedBuildItem): string {
  const base = `${item.manufacturer} ${item.model}`.trim();
  return item.quantity > 1 ? `${base} (×${item.quantity})` : base;
}
