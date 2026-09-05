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

/**
 * M0-seed.md §4 — deterministic share/build item order (architect-directed, 2026-09-05): category,
 * in this display order, then manufacturer, then model, then quantity descending. Derived from
 * `CATEGORIES`'s own declaration order (an index lookup) rather than a second hand-typed list, so
 * the two can never silently drift apart.
 */
export const categoryOrder: Record<Category, number> = Object.fromEntries(
  CATEGORIES.map((category, index) => [category, index]),
) as Record<Category, number>;

type CategoryOrderable = {
  category: Category;
  manufacturer: string;
  model: string;
  quantity: number;
};

/**
 * The Task 3 sort rule, sorted **once, in the API** (`GET /builds/{id}` and the share route) —
 * downstream consumers (Markdown, PNG, web) must consume that order and never re-sort. Takes a key
 * extractor so it works both on flat shapes (`SharedBuildItem`) and on nested ones (e.g.
 * `BuildItemExpanded`, via `{ product, part }`) without a second copy of the comparator per shape.
 * Manufacturer/model compare with a fixed locale (`'en'`), never the ambient one, so item order
 * cannot vary by host locale.
 */
export function compareByCategoryOrder<T>(
  getKey: (item: T) => CategoryOrderable,
): (a: T, b: T) => number {
  return (a, b) => {
    const ka = getKey(a);
    const kb = getKey(b);
    const categoryDiff = categoryOrder[ka.category] - categoryOrder[kb.category];
    if (categoryDiff !== 0) return categoryDiff;
    const manufacturerDiff = ka.manufacturer.localeCompare(kb.manufacturer, 'en');
    if (manufacturerDiff !== 0) return manufacturerDiff;
    const modelDiff = ka.model.localeCompare(kb.model, 'en');
    if (modelDiff !== 0) return modelDiff;
    return kb.quantity - ka.quantity; // descending
  };
}
