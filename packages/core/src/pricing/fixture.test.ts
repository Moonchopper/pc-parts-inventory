import { describe, expect, it } from 'vitest';
import { FixtureProvider } from './fixture.js';

/**
 * Identity strings verbatim from the brief's PM addendum (2026-09-05), quoting
 * `tools/scanner/fixtures/MOONPC.redacted.json` — the real scan (10 components -> 9 products) —
 * and from `packages/contracts/fixtures/scan.sample.json`, which is what `pnpm harness --name w03`
 * actually imports on this branch (W0.1's `harness.ts` — out of this brief's Scope to repoint —
 * defaults to the hand-written sample; `--fixture` can point it at MOONPC.redacted.json instead).
 * `packages/core/fixtures/quotes.json` is authored to match products from both, so `quotesRecorded
 * >= 2` holds regardless of which one a given harness run imports.
 */
describe('FixtureProvider — MOONPC.redacted.json identities', () => {
  it('matches the G.SKILL memory by partNumber', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'memory',
      manufacturer: 'G.SKILL',
      model: 'F5-6000J3036G32G',
      partNumber: 'F5-6000J3036G32G',
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.confidence).toBeGreaterThanOrEqual(0.9);
    const quote = await provider.quote({ externalId: results[0]?.externalId ?? '' });
    expect(quote?.priceCents).toBeGreaterThan(0);
  });

  it('matches the Crucial SSD by manufacturer|model (no partNumber on this scanned component)', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'storage',
      manufacturer: 'Crucial',
      model: 'CT2000T700SSD5',
    });
    expect(results).toHaveLength(1);
    const quote = await provider.quote({ externalId: results[0]?.externalId ?? '' });
    expect(quote?.priceCents).toBeGreaterThan(0);
  });

  it('matches the RTX 4070 Ti SUPER by manufacturer|model', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'gpu',
      manufacturer: 'NVIDIA',
      model: 'GeForce RTX 4070 Ti SUPER',
    });
    expect(results).toHaveLength(1);
  });

  it('matches the Ryzen 7 9800X3D by manufacturer|model', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'cpu',
      manufacturer: 'AMD',
      model: 'Ryzen 7 9800X3D',
    });
    expect(results).toHaveLength(1);
  });
});

describe('FixtureProvider — scan.sample.json identities (what `pnpm harness --name w03` imports)', () => {
  it('matches the AMD Ryzen 9 7900X cpu by partNumber', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'cpu',
      manufacturer: 'AMD',
      model: 'Ryzen 9 7900X',
      partNumber: '100-100000589WOF',
    });
    expect(results).toHaveLength(1);
  });

  it('matches the Samsung 980 PRO 1TB storage by partNumber', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'storage',
      manufacturer: 'Samsung',
      model: '980 PRO 1TB',
      partNumber: 'MZ-V8P1T0B',
    });
    expect(results).toHaveLength(1);
  });

  it('matches the NVIDIA GeForce RTX 4070 gpu by manufacturer|model', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'gpu',
      manufacturer: 'NVIDIA',
      model: 'GeForce RTX 4070',
    });
    expect(results).toHaveLength(1);
  });

  it('matches the Corsair Vengeance DDR5 memory by partNumber', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'memory',
      manufacturer: 'Corsair',
      model: 'Vengeance DDR5',
      partNumber: 'CMK32GX5M2B5200C40',
    });
    expect(results).toHaveLength(1);
  });
});

describe('FixtureProvider — lookup behaviour', () => {
  it('is case-insensitive and whitespace-normalised on manufacturer|model lookups', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'cpu',
      manufacturer: '  amd  ',
      model: 'RYZEN   7 9800x3d',
    });
    expect(results).toHaveLength(1);
  });

  it('falls back to manufacturer|model when a partNumber is present but not found', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'cpu',
      manufacturer: 'AMD',
      model: 'Ryzen 7 9800X3D',
      partNumber: 'not-a-real-part-number',
    });
    expect(results).toHaveLength(1);
  });

  it('returns [] for an unknown product', async () => {
    const provider = new FixtureProvider();
    const results = await provider.search({
      category: 'other',
      manufacturer: 'Nobody',
      model: 'Nothing',
    });
    expect(results).toEqual([]);
  });

  it('quote() returns null for a stale/unknown externalId', async () => {
    const provider = new FixtureProvider();
    expect(await provider.quote({ externalId: 'pn:does-not-exist' })).toBeNull();
    expect(await provider.quote({ externalId: 'garbage' })).toBeNull();
  });
});
