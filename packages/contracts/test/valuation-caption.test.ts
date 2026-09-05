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

describe('valuationCaption — F12 pluralisation ("1 part" / "2 parts", each count independently)', () => {
  it('singularizes "part" for coverage.items === 1 (the "no part has both…" branch)', () => {
    expect(
      valuationCaption({ comparable: { items: 0 }, coverage: { withCurrent: 1, items: 1 } }),
    ).toBe('Now covers 1 of 1 part · no part has both a cost basis and a price yet');
  });

  it('pluralizes "parts" for coverage.items > 1 (the "no part has both…" branch)', () => {
    expect(
      valuationCaption({ comparable: { items: 0 }, coverage: { withCurrent: 2, items: 5 } }),
    ).toBe('Now covers 2 of 5 parts · no part has both a cost basis and a price yet');
  });

  it('singularizes both counts independently when both are 1 (the delta branch)', () => {
    expect(
      valuationCaption({ comparable: { items: 1 }, coverage: { withCurrent: 1, items: 1 } }),
    ).toBe('Now covers 1 of 1 part · delta over the 1 part with both a cost basis and a price');
  });

  it('pluralizes coverage.items while singularizing comparable.items independently (the delta branch — this was the "1 parts" bug)', () => {
    expect(
      valuationCaption({ comparable: { items: 1 }, coverage: { withCurrent: 3, items: 4 } }),
    ).toBe('Now covers 3 of 4 parts · delta over the 1 part with both a cost basis and a price');
  });
});
