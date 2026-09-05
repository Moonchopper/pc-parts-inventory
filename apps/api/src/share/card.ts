import type { SharedBuild, SharedBuildItem } from '@pcpi/contracts';
import { categoryLabel, valuationCaption } from '@pcpi/contracts';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { loadCardFonts } from './fonts.js';
import { itemDisplayName } from './item-name.js';
import { formatCents, formatSignedCents, formatSignedPercent } from './money.js';
import { truncate } from './text.js';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const MAX_ITEMS_SHOWN = 8;
const NAME_MAX_CHARS = 40;
const ITEM_NAME_MAX_CHARS = 56;
/**
 * PM-flagged clipping fix (2026-09-05): the caption under Paid/Now/Δ is now a full sentence
 * (`valuationCaption`, `@pcpi/contracts`), long enough to need wrapping. We hand-wrap in JS — same
 * reasoning as `truncate()` below: never rely on satori's own text layout for sizing, because
 * satori bakes the SVG at whatever width the text naturally takes and clips at the canvas edge
 * rather than reflowing, so *we* must be the ones deciding where lines break. Capped at 2 lines
 * unconditionally; the footer layout budgets exactly that many (see `valuationSummary`).
 */
const CAPTION_MAX_CHARS_PER_LINE = 55;

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
 * Splits `valuationCaption`'s sentence into at most 2 lines, breaking at the last space at-or-
 * before the limit so no word is ever cut mid-token (falls back to a hard break only if there is
 * no earlier space — never happens for the fixed vocabulary `valuationCaption` produces, but the
 * cap holds regardless). Always returns 1 or 2 lines, never more — the footer layout below budgets
 * exactly that many.
 */
function wrapCaptionLines(caption: string): string[] {
  if (caption.length <= CAPTION_MAX_CHARS_PER_LINE) return [caption];
  const breakAt = caption.lastIndexOf(' ', CAPTION_MAX_CHARS_PER_LINE);
  const splitIndex = breakAt > 0 ? breakAt : CAPTION_MAX_CHARS_PER_LINE;
  return [caption.slice(0, splitIndex).trimEnd(), caption.slice(splitIndex).trimStart()];
}

/**
 * Task 7 presentation rule, revised 2026-09-05 (architect, presentation-only): Paid / Now / Δ,
 * unchanged, plus an explanatory caption from `valuationCaption` (`@pcpi/contracts` — the single
 * source shared with the Markdown export, the share page and the build page, so the wording can
 * never drift between surfaces). Δ renders `—` (never `0`/`+0.0%`) when `comparable.items === 0` —
 * "no comparable items" and "no change" are different facts, and conflating them was the original
 * fallback bug in another costume.
 *
 * PM-flagged clipping fix: the Paid/Now/Δ row and the (now up to 2-line) caption must both sit
 * inside the 630px card's 48px padding box. `buildCardTree` trims the items column's own padding
 * and gaps to make room; this function keeps its own internal gap tight (4px) rather than the
 * looser 6px it used when the caption was a single short line.
 */
function valuationSummary(build: SharedBuild): CardNode {
  if (!build.valuation) {
    return text('Valuation not available yet', {
      fontSize: 20,
      fontWeight: 400,
      color: COLOR_FAINT,
    });
  }

  const { acquiredCents, currentCents, comparable } = build.valuation;
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

  return div({ display: 'flex', flexDirection: 'column', gap: 4 }, [
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
    ...wrapCaptionLines(valuationCaption(build.valuation)).map((line) =>
      text(line, { fontSize: 14, fontWeight: 400, color: COLOR_FAINT }),
    ),
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
      // PM-flagged clipping fix (2026-09-05): trimmed from 14/8/8 to make room for the footer
      // caption's second line (`valuationCaption`, now a full sentence) without shrinking the
      // card or dropping below `MAX_ITEMS_SHOWN` — a few px of item leading, invisible on its own,
      // reclaimed rather than clipping the caption's descenders at the bottom edge.
      gap: 12,
      flexGrow: 1,
      width: '100%',
      paddingTop: 4,
      paddingBottom: 4,
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
      // `flex-end` (not `center`): `valuationSummary` can now be up to 3 lines tall (Paid/Now/Δ +
      // a 2-line caption), so bottom-anchoring keeps "Shared build · slug" sitting on the same
      // baseline as the caption's last line instead of floating at the vertical middle of a block
      // that grew taller than it.
      alignItems: 'flex-end',
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
      // PM-flagged clipping fix (2026-09-05): 20 -> 16 between header/divider/items/footer, one of
      // several small reclaims (see `itemsColumn` and `valuationSummary`) that together make room
      // for the footer caption's second line without touching `MAX_ITEMS_SHOWN` or the card size.
      gap: 16,
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
