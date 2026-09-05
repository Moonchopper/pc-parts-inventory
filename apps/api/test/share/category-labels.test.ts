import { CATEGORIES } from '@pcpi/contracts';
import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, categoryLabel } from '../../src/share/category-labels.js';

describe('CATEGORY_LABELS', () => {
  it('covers every §3 CATEGORIES member with a non-empty, human-readable label', () => {
    for (const category of CATEGORIES) {
      const label = categoryLabel(category);
      expect(label, `category "${category}" has no label`).toBeTypeOf('string');
      expect(label.length, `category "${category}" has an empty label`).toBeGreaterThan(0);
      expect(label, `category "${category}" rendered its own enum key back unlabeled`).not.toBe(
        'undefined',
      );
    }
  });

  it('has exactly one entry per CATEGORIES member (no stragglers, nothing missing)', () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('renders PCPartPicker-style names for the trickier categories', () => {
    expect(categoryLabel('gpu')).toBe('Video Card');
    expect(categoryLabel('cpu_cooler')).toBe('CPU Cooler');
    expect(categoryLabel('psu')).toBe('Power Supply');
    expect(categoryLabel('case_fan')).toBe('Case Fan');
  });
});
