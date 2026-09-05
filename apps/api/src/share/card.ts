import type { SharedBuild, SharedBuildItem } from '@pcpi/contracts';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { categoryLabel } from './category-labels.js';
import { loadCardFonts } from './fonts.js';
import { itemDisplayName } from './item-name.js';
import { formatCents, formatSignedCents, formatSignedPercent } from './money.js';
import { truncate } from './text.js';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const MAX_ITEMS_SHOWN = 8;
const NAME_MAX_CHARS = 40;
const ITEM_NAME_MAX_CHARS = 56;

const COLOR_BG = '#0b1220';
const COLOR_DIVIDER = '#1f2937';
const COLOR_TEXT = '#f8fafc';
const COLOR_MUTED = '#94a3b8';
const COLOR_FAINT = '#64748b';
const COLOR_BADGE_BG = '#1e293b';
const COLOR_BADGE_TEXT = '#93c5fd';
const COLOR_UP = '#4ade80';
const COLOR_DOWN = '#f87171';

/**
 * satori is JSX-free here (Recon: this is not a React project) — the element tree is plain
 * objects, satori's documented non-JSX form. `Style` is intentionally loose (matches satori's own
 * `Style` type); every node with more than one child sets `display: 'flex'`, satori's one hard
 * layout rule.
 */
type Style = Record<string, string | number>;
type CardNode = {
  type: string;
  props: { style: Style; children?: CardNode | string | (CardNode | string)[] };
};

function div(style: Style, children?: CardNode | string | (CardNode | string)[]): CardNode {
  return { type: 'div', props: { style, ...(children !== undefined ? { children } : {}) } };
}

function text(value: string, style: Style): CardNode {
  return { type: 'span', props: { style, children: value } };
}

function categoryBadge(category: SharedBuildItem['category']): CardNode {
  return div(
    {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 128,
      height: 32,
      borderRadius: 6,
      backgroundColor: COLOR_BADGE_BG,
    },
    text(categoryLabel(category).toUpperCase(), {
      fontSize: 14,
      fontWeight: 700,
      color: COLOR_BADGE_TEXT,
    }),
  );
}

function itemRow(item: SharedBuildItem, currency: string): CardNode {
  return div(
    {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    [
      div({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16, minWidth: 0 }, [
        categoryBadge(item.category),
        text(truncate(itemDisplayName(item), ITEM_NAME_MAX_CHARS), {
          fontSize: 24,
          fontWeight: 400,
          color: COLOR_TEXT,
        }),
      ]),
      text(item.currentCents != null ? formatCents(item.currentCents, currency) : '—', {
        fontSize: 22,
        fontWeight: 400,
        color: COLOR_MUTED,
      }),
    ],
  );
}

/**
 * Task 7 presentation rule: Paid / Now / Δ with a "n of m priced" caption from `coverage`. Δ
 * renders `—` (never `0`/`+0.0%`) when `comparable.items === 0` — "no comparable items" and "no
 * change" are different facts, and conflating them was the original fallback bug in another
 * costume.
 */
function valuationSummary(build: SharedBuild): CardNode {
  if (!build.valuation) {
    return text('Valuation not available yet', {
      fontSize: 20,
      fontWeight: 400,
      color: COLOR_FAINT,
    });
  }

  const { acquiredCents, currentCents, comparable, coverage } = build.valuation;
  const hasComparable = comparable.items > 0;
  const deltaColor = !hasComparable
    ? COLOR_MUTED
    : comparable.deltaCents > 0
      ? COLOR_UP
      : comparable.deltaCents < 0
        ? COLOR_DOWN
        : COLOR_MUTED;
  const deltaText = !hasComparable
    ? '—'
    : comparable.deltaPct != null
      ? `${formatSignedCents(comparable.deltaCents, build.currency)} (${formatSignedPercent(comparable.deltaPct)})`
      : formatSignedCents(comparable.deltaCents, build.currency);

  return div({ display: 'flex', flexDirection: 'column', gap: 6 }, [
    div({ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16 }, [
      text(`Paid ${formatCents(acquiredCents, build.currency)}`, {
        fontSize: 22,
        fontWeight: 400,
        color: COLOR_MUTED,
      }),
      // Plain middle dot, not an arrow glyph (`→`, U+2192): the embedded Inter subset
      // (`apps/api/assets`) has no glyph for it, and satori/resvg render the gap as a tofu box
      // instead of failing loudly — invisible until this brief actually populated `valuation` for
      // the first time. `·` is already proven safe elsewhere on this card ("Shared build · slug").
      text('·', { fontSize: 22, fontWeight: 400, color: COLOR_FAINT }),
      text(`Now ${formatCents(currentCents, build.currency)}`, {
        fontSize: 22,
        fontWeight: 700,
        color: COLOR_TEXT,
      }),
      text(deltaText, { fontSize: 22, fontWeight: 700, color: deltaColor }),
    ]),
    text(`${coverage.withCurrent} of ${coverage.items} priced`, {
      fontSize: 14,
      fontWeight: 400,
      color: COLOR_FAINT,
    }),
  ]);
}

/**
 * Builds the satori element tree for the 1200×630 share card (deliverable 2). Exported so tests
 * can assert on the tree shape (e.g. the leak test) without paying for a full satori+resvg render.
 * Long names are truncated in JS (never relies on satori's CSS text-overflow support) so the card
 * can never overflow regardless of the build/item name length.
 */
export function buildCardTree(build: SharedBuild): CardNode {
  const items = build.items.slice(0, MAX_ITEMS_SHOWN);
  const overflow = build.items.length - items.length;

  const itemsColumn = div(
    {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      flexGrow: 1,
      width: '100%',
      paddingTop: 8,
      paddingBottom: 8,
    },
    [
      ...items.map((item) => itemRow(item, build.currency)),
      ...(overflow > 0
        ? [text(`+${overflow} more`, { fontSize: 20, fontWeight: 400, color: COLOR_FAINT })]
        : []),
    ],
  );

  const header = div(
    {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    [
      text(truncate(build.name, NAME_MAX_CHARS), {
        fontSize: 52,
        fontWeight: 700,
        color: COLOR_TEXT,
      }),
      text('PC PARTS INVENTORY', {
        fontSize: 18,
        fontWeight: 700,
        color: COLOR_FAINT,
        letterSpacing: 2,
      }),
    ],
  );

  const divider = div({
    display: 'flex',
    width: '100%',
    height: 2,
    backgroundColor: COLOR_DIVIDER,
  });

  const footer = div(
    {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    [
      valuationSummary(build),
      text(`Shared build · ${build.slug}`, { fontSize: 16, fontWeight: 400, color: COLOR_FAINT }),
    ],
  );

  return div(
    {
      display: 'flex',
      flexDirection: 'column',
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      padding: 48,
      gap: 20,
      backgroundColor: COLOR_BG,
      fontFamily: 'Inter',
    },
    [header, divider, itemsColumn, footer],
  );
}

/** The intermediate SVG (exported for the leak test — cheaper and more direct to assert on than raster PNG bytes). */
export async function buildCardSvg(build: SharedBuild): Promise<string> {
  const tree = buildCardTree(build);
  return satori(tree, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: loadCardFonts(),
  });
}

/** satori (object tree) → SVG → `@resvg/resvg-js` → PNG buffer. No headless browser (R6). */
export async function renderCardPng(build: SharedBuild): Promise<Buffer> {
  const svg = await buildCardSvg(build);
  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}
