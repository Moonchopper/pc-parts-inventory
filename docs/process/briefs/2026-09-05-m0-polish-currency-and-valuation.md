# Brief: m0-polish-currency-and-valuation  (2026-09-05, tier: sonnet, author: pm, wave: M0 Seed / W0.7 polish)

**Goal (one sentence):** Make currency explicit in the share contract instead of assumed, and stop the inventory
table's `current`/`delta` columns rendering em-dashes now that the valuation endpoint exists.

**Why / where it fits:** Two gaps the PM found while validating W0.4 and W0.5, batched into one brief rather than
round-tripped to their original authors (playbook learning 9). The `currency` field is an **architect-approved
contract change** (2026-09-05) — `docs/milestones/M0-seed.md` §4 is already updated. This brief runs **in parallel
with W0.6** (disjoint scopes: docker/CI vs contracts/api/web) and **merges after W0.5**, so the renderers it edits
already exist. The §7 integration gate runs on the result of both.

## Worktree and branch (work only here)

```
worktree: d:\pc-parts-inventory-wt\polish-currency-valuation
branch:   feat/m0-polish-currency-valuation   (cut from feat/m0-seed AFTER W0.5 merged)
```
Run `pnpm install` then `pnpm build` in the worktree first — the harness imports built `dist/` output, so an
unbuilt workspace fails with `ERR_MODULE_NOT_FOUND` on `@pcpi/contracts/dist/index.js`. Never commit to `main`
(it does not exist) or to `feat/m0-seed`.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions, § Framework notes (exact pins; the single-`z` rule).
- `docs/milestones/M0-seed.md` — **§4 `SharedBuild` (already carries `currency`) and `Valuation`**, §1 D5/D6, §5.
- The merged slice: `apps/api/src/share/routes.ts` (JSON + `.md` + `card.png`, W0.1 + W0.5),
  `apps/api/src/builds/routes.ts` (`GET /builds/{id}/valuation`, W0.3), `packages/contracts/src/domain.ts`,
  `apps/web/src/routes/+page.server.ts` (the documented em-dash gap) and `apps/web/src/routes/b/[slug]/`.
- `~/.claude/playbook/multi-agent-playbook.md` §3, §6, §9.

## Recon (by the PM)

### Task 1 — `SharedBuild.currency`
The architect's ruling, verbatim in effect: **`currency: string` (ISO-4217) becomes a required top-level field of
`SharedBuild`.** It governs *every* cents value in the response — `items[].currentCents` and all of `valuation.*` —
exactly as `Valuation.currency` already does. **v1 value is the owner's default, `USD`, resolved in the API's share
route — not in the web layer.** No per-item currency; mixed-currency builds are out of scope until a later ADR.

Why it matters: `apps/web`'s share page currently **hardcodes `'USD'`** when formatting valuation totals, and
W0.5's Markdown/PNG renderers pick their own `$`. That is three independent guesses at a fact the API knows.

### Task 2 — inventory `current`/`delta`
W0.4 shipped `/` with `current` and `delta` columns rendering `—` and documented why in
`apps/web/src/routes/+page.server.ts`: on its branch **no endpoint exposed per-part current price**, and computing
D5's kind-precedence client-side would have duplicated business logic the API owns. That was the correct call at
the time and is **not** a defect to scold — the dependency simply had not landed.

It has now. W0.3 delivered `GET /builds/{id}/valuation`, whose §4 shape is
`{ buildId, currency, acquiredCents, currentCents, deltaCents, deltaPct, items: { partId, acquiredCents?, currentCents?, quote?: { kind, provider, observedAt, ageDays } }[] }`
— i.e. **per-`partId` current and acquired figures, already resolved through D5 precedence server-side.** That is
exactly what the inventory table needs, and it needs no new endpoint.

**The honest limit, and you must respect it:** valuation is *build-scoped*. A part with `status = 'on_shelf'`
that is in no build has no valuation row. **Those rows must keep rendering `—`** — do not invent a price, do not
fall back to a raw quote and call it "current", and do not hide the row. Say in your report how many rows in a
real run land in each bucket.

### Gotchas
1. **Money is integer minor units (D6).** Format at the edge only. Never build a float and `toFixed` it. W0.4
   already has `apps/web/src/lib/money.ts` — extend it to take a currency code rather than adding a second
   formatter next to it.
2. **Generated files.** `packages/contracts/openapi.json` and `generated/client.d.ts` are produced by `pnpm gen`
   and **committed**. Regenerate them and commit the result; never hand-edit. `pnpm gen` is idempotent — a second
   run must leave them byte-identical (the PM checks this with an md5).
3. **The single `z`.** Import `z` from `packages/contracts/src/z.ts` (re-exported by the package index), never
   from `zod`, or `.openapi()` metadata is silently lost and your field vanishes from the spec.
4. **A required field is a breaking change to every consumer.** Adding `currency` to the zod schema will fail
   API tests, harness checks and web loads that build a `SharedBuild` without it. Fix them all; do not make the
   field optional to dodge the fallout. If something genuinely cannot supply it, escalate.
5. `pnpm exec biome check apps/web` is the scoped lint for the web files; the root `pnpm lint` covers everything
   and must be green. `.svelte` files are excluded from Biome by `apps/web/biome.json` (declared, accepted) —
   `svelte-check` is what covers them, and it must stay at **0 errors**.

## Contracts (satisfy exactly; if one must change, escalate)
- §4 `SharedBuild` **with `currency`** — a required, non-empty ISO-4217 string. Share responses still carry **no**
  serials, notes, acquiredSource or owner data, and `private` builds still 404 on all three share routes.
- §4 `Valuation` is unchanged — read it, do not modify it.
- D6 integer minor units everywhere; D5 precedence stays server-side in `packages/core`.

## Scope
**May edit:**
- `packages/contracts/src/**` (the `SharedBuild` schema), plus the regenerated `packages/contracts/openapi.json`
  and `packages/contracts/generated/client.d.ts`
- `apps/api/src/share/**` — populate `currency` in the JSON route; replace hardcoded `$`/USD in the Markdown and
  PNG renderers with the field
- `apps/web/src/**` — share page (drop the hardcoded `'USD'`), inventory page (`current`/`delta`), `lib/money.ts`
- tests: `apps/api/test/**`, `apps/web/tests/**`
- `tools/harness/checks/**` only if a required-field change breaks an existing check — a **minimal** fix, and say so

**Read-only:** everything else. Specifically **do not touch `docker/**`, `compose.yaml`, `.github/**` or
`.dockerignore`** — W0.6 is running in parallel and owns those. Do not touch `packages/core`'s valuation logic,
`apps/api/src/pricing/**`, `apps/api/src/jobs/**`, `tools/scanner/**`, `biome.json` or root config.
`CLAUDE.md`, `README.md`, ADRs and `docs/**` are PM-owned — doc deltas go in your report's `Follow-ups`.

## Deliverables
1. **`SharedBuild.currency`** in `packages/contracts`, required, ISO-4217. Regenerate and commit `openapi.json`
   + `generated/client.d.ts`.
2. **API share route** resolves it from the owner's default (`USD` in v1) and returns it. One place decides it;
   the `.md` and `card.png` renderers read that same value rather than choosing their own symbol. A currency whose
   symbol you do not know must still render correctly — prefer `Intl.NumberFormat` with the code, and make sure
   the PNG's font can draw whatever comes out (fall back to the code, e.g. `1 234,56 EUR`, rather than a tofu box).
3. **Web share page** formats every figure with the response's `currency`; the hardcoded `'USD'` is gone.
4. **Inventory `current`/`delta`** populated from `GET /builds/{id}/valuation` for parts that are in a build,
   with parts in no build still showing `—`. Keep it to a bounded number of requests — fetch each relevant build's
   valuation once and index by `partId`; do not issue one request per part.
5. **Tests:** the `SharedBuild` schema rejects a payload with no `currency`; the `.md` and the PNG both render a
   non-USD currency correctly (a unit test with `EUR` is enough — no need to add a currency to the DB);
   the inventory maps valuation rows onto parts and leaves unbuilt parts as `—`.

## Acceptance (named, runnable — paste the tails)
- [ ] `pnpm install && pnpm build` green
- [ ] `pnpm typecheck` green, **`svelte-check` 0 errors**
- [ ] `pnpm lint` green (full repo, not just the scoped run)
- [ ] `pnpm test` green — name the new tests
- [ ] `pnpm gen` regenerates cleanly and is **idempotent** (second run leaves both files byte-identical); both committed
- [ ] `pnpm harness --name w07` → exit 0, counters quoted, **no regression** in `share.md.rows`, `card.bytes`,
      `share.html.ogTags`, `quotesRecorded` or `valuation.*`
- [ ] `pnpm harness --name w07-real --fixture tools/scanner/fixtures/MOONPC.redacted.json` → exit 0; this is the
      9-item real-hardware build the §7 gate uses — quote its counters too
- [ ] **`Read` `artifacts/harness/w07-real/card.png` yourself** and describe what you see, including how the
      currency renders
- [ ] State how many inventory rows show a real `current` vs `—`, and why each is in its bucket

## Non-goals
- No per-item currency, no multi-currency conversion, no FX rates — a later ADR (architect, explicit).
- No new endpoints. No changes to `Valuation`, to D5 precedence, or to `packages/core`.
- No Docker, compose or CI changes — W0.6 owns those and is running right now.
- Do not make `currency` optional to avoid fixing consumers.
- Do not invent a `current` value for parts that are in no build.

## When to ask for help (escalation — one rung up only: the **PM (Opus)**)
`STATUS: ESCALATE` + the playbook §3 message, then stop, when: two failed attempts at the same sub-goal; the
required-field change cascades somewhere you may not edit; a test can only go green by weakening it; you need a
file outside Scope; a toolchain failure survives one retry. **Do not widen the contract beyond the `currency`
field the architect approved.**

## Done definition
Playbook §9 report with real tails per gate, both harness runs' counters quoted, your own reading of
`card.png`, the inventory bucket counts, no TODOs, gate tails in the final commit message, work only on
`feat/m0-polish-currency-valuation`, doc deltas in `Follow-ups`.

---

## Task 3 — deterministic item order (architect-directed, 2026-09-05: a **rule**, not a suggestion)

**The problem.** The PM observed the same build rendering its items in a different order on consecutive harness
runs. Today's ordering is whatever the database hands back, so the share JSON, the web page, the Markdown table
and the PNG card can each disagree with the other three, and the same build looks different every time it is
shared. PCPartPicker orders by component type, and that is the bar (intake, Pillar 3).

**The rule.** Share items — and the items of `GET /builds/{id}` — are ordered by:
1. **category**, in the display order of the §3 enum:
   `cpu, cpu_cooler, motherboard, memory, storage, gpu, case, psu, case_fan, monitor, os, keyboard, mouse,
   headset, other`
2. then **manufacturer** (locale-independent comparison — use `localeCompare` with a fixed locale or plain `<`,
   not the ambient one)
3. then **model**
4. then **quantity descending**

**Sort once, in the API.** The share route (and `GET /builds/{id}`) emits already-ordered items; the Markdown
renderer, the PNG renderer and the web page consume that order and **must not re-sort**. One sort, four consumers,
no possibility of drift. If you find yourself adding a second `.sort()` anywhere downstream, that is the bug.

**Where the ordinal list lives.** `packages/contracts`, next to the category enum, exported as **`categoryOrder`**,
so the inventory page can use the same one. Note that the required order is **identical to the existing
`CATEGORIES` declaration order** — so derive `categoryOrder` from `CATEGORIES` (an index lookup) rather than
typing a second list that can silently drift out of step with the enum. If you do write a literal, add a test that
asserts the two agree member-for-member.

**Named test required:** two runs over the same fixture produce **identical item arrays** — deep-equal, not
just same-length. A test that only checks the first element is not sufficient.

**Scope additions for this task:** `packages/contracts/src/**` (the `categoryOrder` export, already in Scope) and
**`apps/api/src/builds/routes.ts`** (the `GET /builds/{id}` item ordering). Everything else in Scope/Non-goals is
unchanged — in particular `apps/api/src/pricing/**` and `apps/api/src/jobs/**` remain read-only.

`docs/milestones/M0-seed.md` §4 records this rule under `SharedBuild`.
