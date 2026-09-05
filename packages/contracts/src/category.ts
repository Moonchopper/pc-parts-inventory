import { z } from './z.js';

/** M0-seed.md §3 — matches PCPartPicker's vocabulary. */
export const CATEGORIES = [
  'cpu',
  'cpu_cooler',
  'motherboard',
  'memory',
  'storage',
  'gpu',
  'case',
  'psu',
  'case_fan',
  'monitor',
  'os',
  'keyboard',
  'mouse',
  'headset',
  'other',
] as const;

export const Category = z.enum(CATEGORIES).openapi('Category');
export type Category = z.infer<typeof Category>;
