import { describe, expect, it } from 'vitest';
import { valuationCaption } from '../src/valuation-caption.js';

describe('valuationCaption — the Paid/Now/Δ explanatory line (architect, 2026-09-05)', () => {
  it('the real MOONPC shape: some priced, some comparable', () => {
    expect(
      valuationCaption({ comparable: { items: 4 }, coverage: { withCurrent: 5, items: 10 } }),
    ).toBe('Now covers 5 of 10 parts · delta over the 4 parts with both a cost basis and a price');
  });

  it('spells out "delta" rather than using the Δ glyph — the PNG card font cannot draw it', () => {
    const caption = valuationCaption({
      comparable: { items: 1 },
      coverage: { withCurrent: 1, items: 1 },
    });
    expect(caption).not.toContain('Δ');
    expect(caption).toContain('delta');
  });

  it('withCurrent > 0 but no item has both a cost basis and a price (comparable.items === 0)', () => {
    expect(
      valuationCaption({ comparable: { items: 0 }, coverage: { withCurrent: 3, items: 6 } }),
    ).toBe('Now covers 3 of 6 parts · no part has both a cost basis and a price yet');
  });

  it('withCurrent === 0 (nothing priced at all) takes precedence over the comparable.items check', () => {
    expect(
      valuationCaption({ comparable: { items: 0 }, coverage: { withCurrent: 0, items: 6 } }),
    ).toBe('No prices yet · add a provider or refresh');
  });

  it('every number comes from coverage/comparable directly, never from the top-level totals', () => {
    // Deliberately weird combination (comparable.items larger than would make sense if it were
    // derived from the totals) to prove the function only reads the two fields it is given.
    expect(
      valuationCaption({ comparable: { items: 99 }, coverage: { withCurrent: 99, items: 100 } }),
    ).toBe(
      'Now covers 99 of 100 parts · delta over the 99 parts with both a cost basis and a price',
    );
  });
});
