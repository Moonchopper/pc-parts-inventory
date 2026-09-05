import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryOrder, compareByCategoryOrder } from '../src/category.js';

describe('categoryOrder', () => {
  it('agrees member-for-member with CATEGORIES declaration order (derived, not a second literal)', () => {
    for (const [index, category] of CATEGORIES.entries()) {
      expect(categoryOrder[category]).toBe(index);
    }
    expect(Object.keys(categoryOrder).length).toBe(CATEGORIES.length);
  });
});

type Item = {
  category: (typeof CATEGORIES)[number];
  manufacturer: string;
  model: string;
  quantity: number;
};

function item(overrides: Partial<Item> = {}): Item {
  return { category: 'other', manufacturer: 'Acme', model: 'Widget', quantity: 1, ...overrides };
}

describe('compareByCategoryOrder — Task 3 (architect-directed, 2026-09-05)', () => {
  const compare = compareByCategoryOrder<Item>((i) => i);

  it('orders by category in the §3 enum display order first', () => {
    const items = [item({ category: 'gpu' }), item({ category: 'cpu' }), item({ category: 'psu' })];
    const sorted = [...items].sort(compare);
    expect(sorted.map((i) => i.category)).toEqual(['cpu', 'gpu', 'psu']);
  });

  it('breaks a category tie by manufacturer (locale-independent)', () => {
    const items = [
      item({ category: 'memory', manufacturer: 'Zeta' }),
      item({ category: 'memory', manufacturer: 'Acme' }),
    ];
    const sorted = [...items].sort(compare);
    expect(sorted.map((i) => i.manufacturer)).toEqual(['Acme', 'Zeta']);
  });

  it('breaks a manufacturer tie by model', () => {
    const items = [
      item({ category: 'memory', manufacturer: 'Corsair', model: 'Vengeance Z' }),
      item({ category: 'memory', manufacturer: 'Corsair', model: 'Vengeance A' }),
    ];
    const sorted = [...items].sort(compare);
    expect(sorted.map((i) => i.model)).toEqual(['Vengeance A', 'Vengeance Z']);
  });

  it('breaks a model tie by quantity descending', () => {
    const items = [
      item({ category: 'memory', manufacturer: 'Corsair', model: 'Vengeance', quantity: 1 }),
      item({ category: 'memory', manufacturer: 'Corsair', model: 'Vengeance', quantity: 4 }),
    ];
    const sorted = [...items].sort(compare);
    expect(sorted.map((i) => i.quantity)).toEqual([4, 1]);
  });

  it('produces a fully deterministic full order across mixed categories', () => {
    const items = [
      item({ category: 'gpu', manufacturer: 'NVIDIA', model: 'RTX 4070' }),
      item({ category: 'cpu', manufacturer: 'AMD', model: 'Ryzen 9 7900X' }),
      item({ category: 'memory', manufacturer: 'Corsair', model: 'Vengeance DDR5', quantity: 2 }),
      item({ category: 'storage', manufacturer: 'Samsung', model: '980 PRO 1TB' }),
    ];
    const sorted = [...items].sort(compare);
    expect(sorted.map((i) => i.category)).toEqual(['cpu', 'memory', 'storage', 'gpu']);
  });

  it('two runs over an identically-shuffled input produce identical (deep-equal) order — not just same length', () => {
    const base = [
      item({ category: 'gpu', manufacturer: 'NVIDIA', model: 'RTX 4070' }),
      item({ category: 'cpu', manufacturer: 'AMD', model: 'Ryzen 9 7900X' }),
      item({ category: 'memory', manufacturer: 'Corsair', model: 'Vengeance DDR5' }),
      item({ category: 'storage', manufacturer: 'Samsung', model: '980 PRO 1TB' }),
      item({ category: 'psu', manufacturer: 'Corsair', model: 'RM850x' }),
    ];
    const shuffledA = [base[3], base[0], base[4], base[1], base[2]] as Item[];
    const shuffledB = [base[1], base[4], base[2], base[0], base[3]] as Item[];
    const sortedA = [...shuffledA].sort(compare);
    const sortedB = [...shuffledB].sort(compare);
    expect(sortedA).toEqual(sortedB);
    expect(sortedA).toEqual([...base].sort(compare));
  });
});
