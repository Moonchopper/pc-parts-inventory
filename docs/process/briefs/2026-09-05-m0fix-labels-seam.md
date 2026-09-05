# Brief: m0fix-labels-seam  (2026-09-05, tier: sonnet, author: pm, wave: M0 fix-up)

**Goal (one sentence):** Move `CATEGORY_LABELS` / `categoryLabel` out of `apps/api/src/share/` and into
`packages/contracts/src/category.ts` beside `categoryOrder`, so the API *and* the web app read PC-part
category names ("Video Card", not `gpu`) from one source.

**Why / where it fits:** This is finding **F6** of `docs/milestones/M0-fixup.md` (Austin's build page showed the raw
`cpu` / `gpu` enum keys while the card and Markdown said "CPU" / "Video Card"). F6's API half is this move; the web
half (`apps/web`) is a separate brief that imports what you export here. Because two later briefs
(`m0fix-api`, `m0fix-web`) are cut from `feat/m0-seed` *after* this lands, this is the **shared seam** that must be
on the wave branch before they start (playbook learning 30) — which is why it is its own tiny brief.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions, § Framework notes (one `z`, exact pins, no new deps here)
- `docs/milestones/M0-fixup.md` — the wave plan; finding **F6** and work item FX.2's F6 bullet
- `packages/contracts/src/category.ts` — `CATEGORIES`, `Category`, `categoryOrder`, `compareByCategoryOrder`;
  the file this map belongs in, and the doc-comment style to match
- `packages/contracts/src/index.ts` — already `export * from './category.js'`, so a new export needs no edit here
- `apps/api/src/share/category-labels.ts` — the map as it exists today (the thing you are moving)
- `apps/api/test/share/category-labels.test.ts` — the three tests that must survive the move
- `packages/contracts/test/category.test.ts` — where the moved tests go

## Recon (PM, 2026-09-05 — grep already done, don't redo it)
- **Exactly two runtime call sites** of `categoryLabel`, both in `apps/api/src/share/`:
  `card.ts:5` (import) → `card.ts:68` (`categoryLabel(category).toUpperCase()`), and
  `markdown.ts:3` (import) → `markdown.ts:44` (`escapeMarkdownCell(categoryLabel(item.category))`).
  One test call site: `apps/api/test/share/category-labels.test.ts`. Nothing else in the repo imports it
  (`grep -rn "categoryLabel\|CATEGORY_LABELS" --include=*.ts --include=*.svelte .`).
- `packages/contracts` has **no dependency on `apps/api`** and must keep it that way — the map is plain data, so
  the move is mechanical.
- Gotcha 1: `packages/contracts` is consumed as **built `dist/`** by `@pcpi/api` (package-name import), so
  `pnpm build` must run before `pnpm test` picks up a new contracts export. `pnpm build` is workspace-ordered;
  just run the gates in `CLAUDE.md`'s order.
- Gotcha 2: contracts imports `z` only from `./z.js` (CLAUDE.md § Framework notes). This change needs no zod at
  all — `CATEGORY_LABELS` is a `Record<Category, string>`, not a schema. Do **not** add an `.openapi()` anything.
- Gotcha 3: `apps/api/src/share/category-labels.ts` is deleted by this brief, not left as a re-export shim — a
  shim is a second source, which is the bug F6 is about.

## Contracts
In `packages/contracts/src/category.ts` (exported through the existing `export * from './category.js'`):
```ts
export const CATEGORY_LABELS: Record<Category, string>;   // values byte-identical to today's api map
export function categoryLabel(category: Category): string;
```
No other public surface changes. No change to `categoryOrder`, `compareByCategoryOrder`, `CATEGORIES` or any zod
schema; `packages/contracts/openapi.json` and `generated/client.d.ts` must come out of `pnpm gen` **unchanged**
(this brief adds no route and no schema — if `git diff` shows either file changed, something is wrong: stop and
say so).

## Scope
**May edit:**
- `packages/contracts/src/category.ts`
- `packages/contracts/test/category.test.ts`
- `apps/api/src/share/card.ts` (import line only)
- `apps/api/src/share/markdown.ts` (import line only)
- delete `apps/api/src/share/category-labels.ts` and `apps/api/test/share/category-labels.test.ts`

**Read-only:** everything else. Do not touch `CLAUDE.md`, milestone docs, `compose.yaml`, the harness, or any other
`apps/api` / `apps/web` file. Shared docs are integrator-owned during fan-out — doc deltas go in your report.

## Acceptance (named, runnable)
Worktree `d:\pc-parts-inventory-wt\labels-seam`, branch `feat/m0-fix-labels-seam` (already created for you; run
`pnpm install --frozen-lockfile` there first).
- [ ] `pnpm build` green
- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green, including the three moved tests, now in `packages/contracts/test/category.test.ts`:
      every `CATEGORIES` member has a non-empty label · exactly one entry per member ·
      `categoryLabel('gpu') === 'Video Card'`, `'cpu_cooler' → 'CPU Cooler'`, `'psu' → 'Power Supply'`,
      `'case_fan' → 'Case Fan'`
- [ ] `pnpm gen` produces **no diff** in `packages/contracts/openapi.json` or
      `packages/contracts/generated/client.d.ts` (`git status --short` after it is the evidence)
- [ ] `pnpm harness --name labels-seam` green — quote `productsCreated`, `partsCreated`, `quotesRecorded`,
      `share.md.rows`, `card.bytes` from `artifacts/harness/labels-seam/report.json`, and confirm
      `artifacts/harness/labels-seam/share.md` still has `Video Card` / `CPU` in its Type column (not `gpu` / `cpu`)
- [ ] **No listener of yours is left running:** `netstat -ano | findstr LISTENING` tail in the report, showing no
      `node`/`tsx` process of yours on any port. The harness spawns an API and a web server on ephemeral ports —
      make sure both are gone when it exits.

## Non-goals
- **Do not** change any label's wording. This is a move, not a rename: `Video Card` stays `Video Card`.
- **Do not** touch `apps/web` — the web side of F6 belongs to `m0fix-web`.
- **Do not** fix F7/D17 (`$0.00` where `—` belongs), F10/D16 (`PUBLIC_ORIGIN`), F12 (pluralisation) or anything
  else on the findings list — those are `m0fix-api`'s. Leave them exactly as they are even when you read past them.
- No new dependencies. No refactor of `card.ts` / `markdown.ts` beyond their import lines.

## When to ask for help (escalation — one rung up only)
Escalate to **the PM (Opus)** when any of: two failed attempts at the same sub-goal; spec ambiguity that changes
the design; a needed contract change; a test that can't go green without weakening it; toolchain failure after one
retry; anything destructive or outside the scope above. Use the escalation message format from
`~/.claude/playbook/multi-agent-playbook.md` §3, return `STATUS: ESCALATE`, and stop — you will be resumed.

## Done definition
Report in playbook §9 format: `STATUS`, `Changed`, `Verified` (command + output tail per gate — **show output,
don't claim**), `Evidence` (harness `report.json` counters quoted; the `share.md` Type-column reading),
`Open issues`, `Escalations`, `Follow-ups`. Gate tails also go in the final commit message. No TODOs. Commit on
`feat/m0-fix-labels-seam` in your worktree — never on `main`, never on `feat/m0-seed`. Do not merge anything.
