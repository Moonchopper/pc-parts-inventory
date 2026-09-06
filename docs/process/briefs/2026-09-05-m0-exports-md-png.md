# Brief: m0-exports-md-png  (2026-09-05, tier: sonnet, author: pm, wave: M0 Seed / W0.5)

**Goal (one sentence):** `GET /share/{slug}.md` returns a PCPartPicker-style Markdown table that pastes well into
Reddit/Discord, and `GET /share/{slug}/card.png` returns a 1200×630 PNG card rendered with satori + resvg — no
headless browser, no network at render time.

**Why / where it fits:** W0.5 of `docs/milestones/M0-seed.md` §6, in parallel with W0.3 and W0.4 on top of the
merged W0.1 seed. Pillar 3 and ADR-0001 **R6**: *"PNG must not require a headless browser in the container."*
The PNG is also W0.4's `og:image` — it is what Discord shows when Austin pastes a build URL.

## Worktree and branch (work only here)

```
worktree: d:\pc-parts-inventory-wt\exports-md-png
branch:   feat/m0-exports-md-png   (created from feat/m0-seed AFTER W0.1 merged)
```
Run `pnpm install` in the worktree first. Never commit to `main` (it does not exist) or to `feat/m0-seed`.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions, § Framework notes (W0.1's pins).
- `docs/milestones/M0-seed.md` — §1 D7 (slug/visibility), §4 `SharedBuild` and `Valuation` DTOs, §5 (the three
  share routes), §6 W0.5, §7 (the integration gate asserts `share.md.rows == items` and `card.png.bytes > 10000`).
- The merged seed: **`apps/api/src/share/routes.ts`** — W0.1 created it with `GET /share/{slug}` (JSON) and it is
  already mounted in `app.ts`. **This file and its directory are yours; `app.ts` is not.**
  Also read `apps/api/src/builds/routes.ts` for the zod-openapi route pattern, and `tools/harness/checks/` for the
  check-module pattern.
- `~/.claude/playbook/multi-agent-playbook.md` §3, §6, §9.

## Recon (by the PM)

### The rendering stack — already smoke-tested on this machine, it works
- `satori@0.33.4` + `@resvg/resvg-js@2.6.2` (pinned by W0.1). The PM verified in a scratch project on this box:
  `new Resvg(svg).render().asPng()` returns a PNG buffer (83 bytes for a trivial rect) under Node 22.14 on
  Windows; `@resvg/resvg-js` pulls a per-platform optional dep (`@resvg/resvg-js-win32-x64-msvc` here,
  `-linux-x64-gnu` in the container — it resolves per platform from the same lockfile, so W0.6's image is fine).
- **satori takes no JSX here.** The API is not a React project; build the element tree as **plain objects**:
  `{ type: 'div', props: { style: {...}, children: [...] } }`. That is satori's documented JSX-free form. Do not
  add React, `preact`, or a JSX transform for this.
- **satori is a strict, tiny subset of CSS.** Every element that has more than one child needs an explicit
  `display: 'flex'` (or `'none'`) — satori throws otherwise. No `grid`, no `float`, no `position: sticky`,
  no shorthand `background` with an image, no `gap` on non-flex. Keep the card to flex rows/columns.
- **Fonts must be supplied as a buffer; satori accepts `ttf`, `otf`, `woff` — NOT `woff2`.**
  The PM checked `@fontsource/inter@5.3.0`: it ships `files/inter-latin-400-normal.woff` and
  `inter-latin-700-normal.woff` (plus `.woff2`, which is useless here). **Recommended approach:**
  `pnpm add -E @fontsource/inter@5.3.0` in `apps/api`, then **copy the two `.woff` files (and the package's OFL
  license text) into `apps/api/assets/` and commit them**, and read them from `assets/` at runtime — so the
  container and CI do not depend on `node_modules` layout, and the license ships with the font (OFL requires the
  license to accompany the font). Resolve the path from `import.meta.url` via `node:url`'s `fileURLToPath`, never
  from `process.cwd()`. **Make sure `assets/**` is not swallowed by `.gitignore`** (`bin/` and `obj/` are ignored;
  `assets/` is not — but check, and check that your build step copies or that you read from the source path).
- Load the fonts **once at module scope** (a lazy singleton), not per request; the harness renders the card and a
  cold read per request would be the slowest thing in the API.

### Seams (do not rebuild them)
- **Add exactly one new harness file**, `tools/harness/checks/50-exports.ts`. Checks are directory-discovered;
  there is no registry. **Do not edit `tools/harness/harness.ts`** — W0.3 and W0.4 are adding their own check
  files right now.
- **Do not edit `apps/api/src/app.ts`.** Your routes go on the router already exported by
  `apps/api/src/share/routes.ts` and already mounted.
- `report.json` counters you own (W0.1 seeded them at zero): `counters.share.md.rows`, `counters.share.md.bytes`,
  `counters.card.bytes`. Do not rename or touch anyone else's.
- **W0.3 is building `GET /builds/{id}/valuation` in parallel** and may not exist on your branch. The share
  payload's `valuation` (from `SharedBuild` in §4) may therefore be absent in your worktree: render the card and
  the Markdown totals **only when it is present**, and degrade gracefully (no "NaN", no "$0.00" pretending to be
  real) when it is not. Do not implement valuation yourself.

## Contracts (satisfy exactly; if one must change, escalate)
- Input is §4 **`SharedBuild`** — and only that. It has **no serials, no notes, no acquiredSource, no owner
  data**; neither the Markdown nor the PNG may contain any of those. `private` builds 404 on all three routes.
- Money is integer minor units + ISO-4217 currency (**D6**). Format for display at the edge only; never do float
  arithmetic on the way there.
- Both new routes are **public** (D3) and registered on the OpenAPI document like every other route. `.md`
  responds `text/markdown; charset=utf-8`; `card.png` responds `image/png`.
- `Content-Disposition` is not required; a sane `Cache-Control` plus the ETag below is.

## Scope
**May edit / create:** `apps/api/src/share/**`, `apps/api/assets/**`, `apps/api/package.json` (**only** to add the
`@fontsource/inter` dependency at an exact version and any asset-copy step), `apps/api/test/share/**` (your
tests), and the single new file `tools/harness/checks/50-exports.ts`.
**Read-only:** everything else — `apps/api/src/app.ts`, `apps/api/src/{pricing,jobs,products,builds}/**` (W0.3),
`apps/web/**` (W0.4), `packages/**`, `tools/harness/harness.ts`, `tools/scanner/**`, root config, `docker/**`,
`.github/**`. `CLAUDE.md`, `README.md`, ADRs and `docs/**` are PM-owned during fan-out — doc deltas go in your
report's `Follow-ups`.

## Deliverables
1. **`GET /api/v1/share/{slug}.md`** — a PCPartPicker-style Markdown table:
   ```
   # <Build name>

   | Type | Item | Price |
   | --- | --- | --- |
   | CPU | AMD Ryzen 7 9800X3D | $479.00 |
   | Memory | G.SKILL F5-6000J3036G32G 2 x 32 GB | $189.99 |
   …
   | **Total (current)** | | **$1,899.98** |
   | **Total (paid)** | | **$1,750.00** |
   | **Delta** | | **+$149.98 (+8.6%)** |

   *Generated by PC Parts Inventory — <share url> — <ISO date>*
   ```
   Exactly **one row per item** in the `SharedBuild.items` array (that is what the §7 gate's
   `share.md.rows == items` asserts). Category labels are human-readable (`cpu` → `CPU`, `gpu` → `Video Card`,
   `cpu_cooler` → `CPU Cooler`, `psu` → `Power Supply`, `case_fan` → `Case Fan`, …) — put the map in one place and
   unit-test it against the full §3 enum so no category can render as `undefined`. Escape `|` and newlines inside
   item names. Quantity > 1 renders as `N x <model>` or a `(×N)` suffix — pick one and test it. Omit the totals
   rows entirely when `valuation` is absent.
2. **`GET /api/v1/share/{slug}/card.png`** — 1200×630, satori (object tree) → SVG → `@resvg/resvg-js` → PNG:
   the build name, up to **8** items (with a "+N more" line when there are more), acquired vs. current with the
   delta (sign and colour: green up / red down), and a small footer. Must render correctly for: a 1-item build,
   a 10-item build, a build with no valuation, and a build with a very long name (**truncate, never overflow**).
   **`ETag` derived from the build's `updatedAt`** (plus the slug); return **304** on a matching
   `If-None-Match`; `Cache-Control: public, max-age=60`. Fonts loaded once from `apps/api/assets/`.
3. **Tests** (`apps/api/test/share/**`, vitest, no network): the Markdown row count equals the item count for a
   fixture with 1, 2 and 10 items; the category label map covers every §3 enum member; `|` escaping; totals
   present/absent with and without `valuation`; **no serial/note/acquiredSource string ever appears in either
   output** (feed a `SharedBuild`-shaped fixture plus a poisoned object with extra fields and assert they do not
   leak); PNG bytes > 10000 for the standard fixture; the 304-on-ETag path; `private` ⇒ 404 on both routes.
4. **Harness check `tools/harness/checks/50-exports.ts`**: fetch both routes for the imported build; assert the
   Markdown has exactly one row per item in the share JSON (write `counters.share.md.rows` and
   `.bytes`); assert the PNG is > 10 000 bytes and starts with the PNG magic bytes (write `counters.card.bytes`);
   **save the PNG to `artifacts/harness/<name>/card.png`** and the Markdown to
   `artifacts/harness/<name>/share.md`.
5. **Read your own PNG.** Open `artifacts/harness/w05/card.png` with the `Read` tool and describe what you
   actually see — the build name, how many item rows are legible, whether the delta line is present and its
   sign, whether anything is clipped or overlapping. **The PM will read it too and will compare against your
   description**; a report that says "the PNG was generated" without describing it is rejected on sight.

## Acceptance (named, runnable — paste the tails)
- [ ] `pnpm install` then `pnpm build` green
- [ ] `pnpm typecheck` green (0 errors)
- [ ] `pnpm lint` green
- [ ] `pnpm test` green — name the row-count, category-map, leak and ETag tests; quote the vitest summary
- [ ] `pnpm gen` runs clean; the two new paths appear in `openapi.json`
- [ ] `pnpm harness --name w05` → exit 0; **quote** `counters.share.md.rows`, `counters.share.md.bytes`,
      `counters.card.bytes` from `artifacts/harness/w05/report.json`, plus the W0.1 counters to prove no regression
- [ ] `artifacts/harness/w05/card.png` **read with the `Read` tool** and described (see Deliverable 5)
- [ ] `artifacts/harness/w05/share.md` pasted (or its first ~15 lines) so the table can be judged by eye
- [ ] Font licence committed alongside the font files; say which files you committed and their sizes

## Non-goals
- **No headless browser, no Puppeteer/Playwright, no React/JSX, no `@vercel/og`** (R6 — that is the whole point of
  satori + resvg). No SVG-by-hand-string templating either; use satori's object tree.
- No changes to the JSON share route's payload shape, no new fields on `SharedBuild`. If the card needs data
  `SharedBuild` does not carry, **escalate** — do not widen the contract, and do not reach past the DTO into the DB.
- No valuation logic (W0.3), no web pages (W0.4), no Dockerfile/CI (W0.6).
- No editing of `app.ts`, `harness.ts`, or another brief's files.
- No new dependency other than `@fontsource/inter` at an exact pin (satori and resvg were pinned by W0.1).
- Do not download a font at build or run time; it is committed.

## When to ask for help (escalation — one rung up only: the **PM (Opus)**)
`STATUS: ESCALATE` + the playbook §3 message, then stop, when: two failed attempts at the same sub-goal (satori's
CSS subset is the likely candidate — escalate rather than switching rendering technology); `SharedBuild` cannot
express the card; a test can only go green by weakening it; you need a file outside Scope; a toolchain failure
survives one retry.

## Done definition
Playbook §9 report with real tails per gate, the counters quoted, **your own reading of `card.png`**, no TODOs,
gate tails in the final commit message, work only on `feat/m0-exports-md-png`, doc deltas in `Follow-ups`.
