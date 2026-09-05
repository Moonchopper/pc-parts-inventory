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

---

## Task 4 — populate the share valuation (architect-directed; this is the milestone's headline outcome)

**The bug.** `apps/api/src/share/service.ts` contains **zero** references to `valuation` or `currentCents`. The
§4 fields exist and nothing fills them, so the share page, the Markdown and the PNG all render `—` and
"Valuation not available yet" — **while `GET /builds/{id}/valuation` returns 167896 cents in the very same
harness run.** No brief owned this: W0.1 built the share route before valuation existed, W0.3 built valuation but
did not own the share route, and W0.5 faithfully rendered fields nobody populates. Playbook learning 15 exactly.

**The fix.** Populate it **once, in the API share route**, from **the same code path `GET /builds/{id}/valuation`
uses — call the service function directly, never the HTTP endpoint.** Then:
- `SharedBuild.valuation` carries `acquiredCents`, `currentCents`, `deltaCents`.
- each `items[].currentCents` comes from that product's chosen quote (D5 precedence, resolved server-side).
- the Markdown totals rows and the PNG's delta line light up automatically — **do not touch the renderers'
  formatting logic**; they already handle the populated case. If they do not, that is the bug to fix, not a reason
  to reformat.

## Task 5 — wire the web to the endpoints that now exist (depends on `m0-crud-endpoints`)

`m0-crud-endpoints` merges **before** this brief and ships the nine missing §5 endpoints. Two consequences:
1. **`apps/web/src/routes/builds/[id]/+page.server.ts`'s `addItem`/`removeItem` form actions currently 502**,
   because `POST /builds/{id}/items` and `DELETE /builds/{id}/items/{partId}` did not exist when W0.4 wrote them.
   They exist now. Verify both work end to end and fix whatever does not — including surfacing the **409**
   (part already in another build) as a readable message rather than a generic 502.
2. **Add an inline "acquired price" edit to the inventory row** — a form action posting to `PATCH /parts/{id}`
   with `acquiredPriceCents`. No JS required (plain `<form method="POST">`), integer minor units on the wire, and
   the valuation figures must change on the next load. This is the §8 manual-test step that is currently
   impossible to perform.

## Task 6 — make the §7 gate read money from the artifacts, not the endpoint (architect-directed)

The old gate asserted `valuation.currentCents > 0` from the **valuation endpoint**, so it went green while every
user-visible artifact showed em-dashes. `docs/milestones/M0-seed.md` §7 is updated; implement it in
`tools/harness/checks/**` (**added to your Scope for this task**):

- Before the share fetches, the harness **`PATCH`es `acquiredPriceCents` onto ≥ 2 parts** of the imported build.
  Values come from a new fixture, **`packages/contracts/fixtures/cost-basis.json`, keyed by `identityKey`** so it
  works for both the sample and the real MOONPC scan. Skip keys that are not in the current fixture; **fail the
  check if fewer than 2 matched**, so a silently-empty cost basis can never pass.
- Then assert, from the **artifacts**:
  - `share.json.valuation.acquiredCents > 0`
  - `share.json.valuation.currentCents > 0`
  - `share.json.valuation.deltaCents != 0`
  - `share.md` contains **at least two non-dash prices and a totals line**
  - `share.json.items` is **identical across two runs** (the Task 3 ordering rule — deep-equal, not same-length)
- Write the new figures into `report.json` counters (`valuation.*` already exists — fill it from the share
  payload now, not the endpoint).

**The PNG must show a total, not "Valuation not available yet"** — the PM reads it and will reject a card that
still says that. That image is the M0 outcome sentence, paid-vs-now, proven end to end.

**Scope addition for Tasks 4–6:** `apps/api/src/share/**`, `apps/web/src/routes/**` (already in Scope),
`tools/harness/checks/**`, and `packages/contracts/fixtures/cost-basis.json`. Still **no** changes to
`packages/core` valuation logic, `apps/api/src/pricing/**`, `apps/api/src/jobs/**`, or anything W0.6 owns
(`docker/**`, `compose.yaml`, `.github/**`).

**Sequencing:** this brief is cut from `feat/m0-seed` **after `m0-crud-endpoints` is merged**. It may run in
parallel with W0.6 (disjoint scopes). The §7 re-run happens after both land.

---

## Task 7 — **the D5 fallback bug** (architect-directed contract revision; read this before Tasks 4–6)

**This supersedes the shape Task 4 assumed.** `docs/milestones/M0-seed.md` §4 and D5 are already updated.

### The bug
`packages/core/src/valuate.ts` line ~61:
```ts
const itemCurrent = quote ? quote.priceCents : itemAcquired;   // <-- fallback to the acquired price
```
When a product has no quote, the item's **acquired price is counted as its current value**. The PM reproduced it:
two parts, `12345 + 6789` cents acquired, **zero quotes** → `acquiredCents 19134, currentCents 19134,
deltaCents 0`. A build of unpriced hardware reports "no change", which inverts what Pillar 2 promises. Worse, the
**same response contradicts itself**: per-item `currentCents` is correctly omitted for unpriced items while the
build total silently substitutes the acquired price.

**A unit test asserts the wrong behaviour** — `packages/core/test/valuate.test.ts`, `'sums acquired vs current
across items and computes deltaCents/deltaPct'`, feeds `{ partId: 'b', acquiredCents: 5000, quotes: [] }` and
expects `currentCents === 13000`. **You must rewrite that test, not work around it.** Under the new contract that
case yields `currentCents 8000`, `comparable.items 1`, `coverage.withAcquired 2`, `coverage.withCurrent 1`.

### The new `Valuation` contract (verbatim; ★ = also carried by `SharedBuild.valuation`)
```ts
Valuation = {
  buildId, currency,
  acquiredCents ★,   // Σ acquired over items with a known cost basis — "what I paid"
  currentCents ★,    // Σ current over items with a quote — "what the priced parts are worth now"
  comparable ★: { items, acquiredCents, currentCents, deltaCents, deltaPct | null },
                     // like-for-like over items having BOTH; deltaCents == currentCents − acquiredCents
                     // holds HERE and only here; deltaPct is null when comparable.acquiredCents == 0
  coverage ★:   { items, withAcquired, withCurrent },
  items: [{ partId, quantity, acquiredCents?, currentCents?, quote?: { kind, provider, observedAt, ageDays } }]
}
```
- **Drop the top-level `deltaCents`/`deltaPct` entirely.** A delta over mismatched item sets is not a delta.
  There is no `unpricedItems` field — `coverage` replaces it.
- **Per-item semantics, previously unstated — this is where the bug hid.** `parts.acquiredPriceCents` is the
  **total paid for that part row (all of its `quantity`)**; an item's `currentCents` is the chosen quote's
  **`priceCents × quantity`**. A row with a quote but no cost basis contributes to `currentCents` and
  `coverage.withCurrent` but **not** to `comparable`.
- **No fallback in either direction, ever.** No acquired→current, no current→acquired.

### Where the fix lands
1. `packages/core/src/valuate.ts` — remove the fallback; compute `comparable` and `coverage`; apply `× quantity`.
2. `packages/core/test/valuate.test.ts` — rewrite the wrong test to the new shape (values above), and add a case
   for a quoted-but-no-cost-basis row and one for `comparable.items == 0` (`deltaPct` must be `null`).
3. `packages/contracts` — the `Valuation` schema, and `SharedBuild.valuation` as the ★ subset. Regenerate.
4. The API valuation service and the share population (Task 4) emit the new shape.
5. `tools/harness/checks/30-pricing.ts` — assert the identity **inside `comparable`**
   (`comparable.deltaCents === comparable.currentCents - comparable.acquiredCents`), not at the top level.
   It currently asserts the old top-level identity and **will fail until you update it**; that is expected.
6. §7 assertions (Task 6) become: `share.json.valuation.acquiredCents > 0`, `currentCents > 0`,
   **`comparable.items >= 2`**, **`comparable.deltaCents != 0`**. **Choose `cost-basis.json` values that differ
   from the fixture quotes** so the delta is provably nonzero — equal values would pass `!= 0` only by accident,
   and a zero delta is exactly the bug you are fixing.

### Presentation (card, Markdown, page)
Show **Paid / Now / Δ** with a small **"n of m priced"** caption derived from `coverage`
(`coverage.withCurrent` of `coverage.items`). **Δ renders `—` when `comparable.items == 0`** — never `0`, never
`+0.0%`, because "no comparable items" and "no change" are different facts and conflating them is the original
bug in another costume. Keep it within satori's CSS subset (flex only) and inside the 1200×630 card.
