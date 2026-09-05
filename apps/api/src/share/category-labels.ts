import type { Category } from '@pcpi/contracts';

/**
 * Human-readable labels for the §3 `Category` enum (PCPartPicker-style naming) — the one place
 * this map lives, shared by the Markdown table and the PNG card so neither can silently render a
 * category as `undefined`. A unit test walks the full §3 `CATEGORIES` tuple against this map.
 */
export const CATEGORY_LABELS: Record<Category, string> = {
  cpu: 'CPU',
  cpu_cooler: 'CPU Cooler',
  motherboard: 'Motherboard',
  memory: 'Memory',
  storage: 'Storage',
  gpu: 'Video Card',
  case: 'Case',
  psu: 'Power Supply',
  case_fan: 'Case Fan',
  monitor: 'Monitor',
  os: 'OS',
  keyboard: 'Keyboard',
  mouse: 'Mouse',
  headset: 'Headset',
  other: 'Other',
};

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category];
}
