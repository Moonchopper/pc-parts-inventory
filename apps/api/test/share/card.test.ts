import type { SharedBuild, SharedBuildItem } from '@pcpi/contracts';
import { describe, expect, it } from 'vitest';
import { buildCardSvg, buildCardTree, renderCardPng } from '../../src/share/card.js';
import { cardETag } from '../../src/share/etag.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function item(overrides: Partial<SharedBuildItem> = {}): SharedBuildItem {
  return {
    category: 'gpu',
    manufacturer: 'NVIDIA',
    model: 'GeForce RTX 4070',
    quantity: 1,
    currentCents: 47900,
    ...overrides,
  };
}

function build(overrides: Partial<SharedBuild> = {}): SharedBuild {
  return {
    slug: 'abc123defg',
    name: 'MOONPC',
    updatedAt: '2026-09-01T00:00:00.000Z',
    items: [item()],
    ...overrides,
  };
}

function nItems(n: number): SharedBuildItem[] {
  return Array.from({ length: n }, (_, i) =>
    item({
      category: 'memory',
      manufacturer: 'Corsair',
      model: `Stick ${i}`,
      currentCents: 10000 + i,
    }),
  );
}

/**
 * satori bakes every glyph into vector `<path>` outlines (its default `embedFont: true`), so
 * literal text never survives as a substring of the rendered SVG/PNG — asserting "the card shows
 * X" has to walk the pre-render object tree (`buildCardTree`) instead. Fill colors and other
 * attribute values (e.g. `#4ade80`) DO survive verbatim in the SVG, since only glyphs become
 * paths — see the "colors the delta" test below.
 */
function collectText(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (node && typeof node === 'object' && 'props' in node) {
    return collectText((node as { props?: { children?: unknown } }).props?.children);
  }
  return [];
}

describe('buildCardTree', () => {
  it('shows an "+N more" line when there are more than 8 items', () => {
    const texts = collectText(buildCardTree(build({ items: nItems(10) })));
    expect(texts.some((t) => t.includes('+2 more'))).toBe(true);
  });

  it('shows no overflow line for 8 items or fewer', () => {
    const texts = collectText(buildCardTree(build({ items: nItems(8) })));
    expect(texts.some((t) => t.includes('more'))).toBe(false);
  });

  it('degrades gracefully with no NaN/$0.00 when valuation is absent', () => {
    const texts = collectText(buildCardTree(build({ valuation: undefined })));
    expect(texts.some((t) => t.includes('Valuation not available yet'))).toBe(true);
    expect(texts.some((t) => t.includes('NaN'))).toBe(false);
    expect(texts.some((t) => t.includes('$0.00'))).toBe(false);
  });

  it('truncates a very long build name rather than overflowing', () => {
    const longName =
      'My Extremely Overengineered Gaming And Streaming And Rendering Battlestation Build Of 2026 Edition';
    const texts = collectText(buildCardTree(build({ name: longName })));
    expect(texts).not.toContain(longName);
    expect(texts.some((t) => t.includes('…') && t.length <= 40)).toBe(true);
  });
});

describe('renderCardPng', () => {
  it('renders a real PNG (magic bytes) over 10000 bytes for the standard fixture', async () => {
    const png = await renderCardPng(
      build({
        items: [
          item({
            category: 'cpu',
            manufacturer: 'AMD',
            model: 'Ryzen 9 7900X',
            currentCents: 40000,
          }),
          item({
            category: 'gpu',
            manufacturer: 'NVIDIA',
            model: 'GeForce RTX 4070',
            currentCents: 55000,
          }),
          item({
            category: 'memory',
            manufacturer: 'Corsair',
            model: 'Vengeance DDR5',
            quantity: 2,
            currentCents: 18999,
          }),
        ],
        valuation: { acquiredCents: 175000, currentCents: 189998, deltaCents: 14998 },
      }),
    );
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(png.length).toBeGreaterThan(10_000);
  });

  it('renders a 1-item build without throwing', async () => {
    const png = await renderCardPng(build({ items: [item()] }));
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('renders a 10-item build (past the 8-shown cap) without throwing', async () => {
    const png = await renderCardPng(build({ items: nItems(10) }));
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('renders a build with no valuation without throwing', async () => {
    const png = await renderCardPng(build({ valuation: undefined }));
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('renders a build with a very long name without throwing', async () => {
    const longName =
      'My Extremely Overengineered Gaming And Streaming And Rendering Battlestation Build Of 2026 Edition';
    const png = await renderCardPng(build({ name: longName }));
    expect(png.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  });

  it('colors the delta green when value went up and red when it went down (SVG fill attributes survive glyph-baking)', async () => {
    const up = await buildCardSvg(
      build({ valuation: { acquiredCents: 1000, currentCents: 1500, deltaCents: 500 } }),
    );
    expect(up).toContain('#4ade80');

    const down = await buildCardSvg(
      build({ valuation: { acquiredCents: 1500, currentCents: 1000, deltaCents: -500 } }),
    );
    expect(down).toContain('#f87171');
  });
});

describe('buildCardTree — never leaks fields SharedBuild does not carry', () => {
  it('ignores serial/notes/acquiredSource even if a poisoned object smuggles them in', () => {
    const poisonedItem = {
      ...item(),
      serial: 'GPU-SN-0001',
      notes: 'bought used, has a scratch',
      acquiredSource: 'ebay-seller-xyz',
    } as SharedBuildItem;
    const poisonedBuild = {
      ...build({ items: [poisonedItem] }),
      owner: 'local',
      ownerId: 'owner-secret-id',
    } as SharedBuild;

    const texts = collectText(buildCardTree(poisonedBuild)).join(' | ');

    expect(texts).not.toContain('GPU-SN-0001');
    expect(texts).not.toContain('scratch');
    expect(texts).not.toContain('ebay-seller-xyz');
    expect(texts).not.toContain('owner-secret-id');
  });

  it('the rendered SVG also never contains those values (defense in depth)', async () => {
    const poisonedItem = {
      ...item(),
      serial: 'GPU-SN-0001',
      notes: 'bought used, has a scratch',
      acquiredSource: 'ebay-seller-xyz',
    } as SharedBuildItem;
    const svg = await buildCardSvg(build({ items: [poisonedItem] }));
    expect(svg).not.toContain('GPU-SN-0001');
    expect(svg).not.toContain('ebay-seller-xyz');
  });
});

describe('cardETag', () => {
  it('is stable for the same slug + updatedAt', () => {
    expect(cardETag('abc123defg', '2026-09-01T00:00:00.000Z')).toBe(
      cardETag('abc123defg', '2026-09-01T00:00:00.000Z'),
    );
  });

  it('changes when updatedAt changes', () => {
    expect(cardETag('abc123defg', '2026-09-01T00:00:00.000Z')).not.toBe(
      cardETag('abc123defg', '2026-09-02T00:00:00.000Z'),
    );
  });

  it('changes when the slug changes', () => {
    expect(cardETag('abc123defg', '2026-09-01T00:00:00.000Z')).not.toBe(
      cardETag('zzz999zzzz', '2026-09-01T00:00:00.000Z'),
    );
  });
});
