# Brief: m0-crud-endpoints  (2026-09-05, tier: sonnet, author: pm, wave: M0 Seed / W0.8)

**Goal (one sentence):** Ship the nine parts/builds endpoints in `docs/milestones/M0-seed.md` §5 that no M0 brief
was ever given, plus the `GET /parts` filters, so the generated spec finally matches §5 in full.

**Why / where it fits:** The PM's integration check diffed §5's endpoint table against the generated
`openapi.json` and found **9 of 12 parts/builds endpoints were never assigned to any brief** — a gap in the wave
plan, not anyone's implementation. The architect's ruling (2026-09-05) is to close all nine inside M0 rather than
defer: the pattern already exists, CRUD over an existing schema is cheap, and these are exactly what a human needs
for the §8 manual pass. **`PATCH /parts/{id}` in particular unblocks the milestone's headline outcome** — without
it `acquiredPriceCents` can never be set, so `acquiredCents` is structurally 0 and *paid-vs-now* (Pillar 2, the M0
outcome sentence) cannot be demonstrated at all. This brief runs **in parallel with W0.6** (disjoint: API + contracts
vs docker/CI) and **merges before** the polish brief, which depends on `PATCH /parts/{id}` and the build-items routes.

## Worktree and branch (work only here)

```
worktree: d:\pc-parts-inventory-wt\crud-endpoints
branch:   feat/m0-crud-endpoints   (already created from feat/m0-seed)
```
Run `pnpm install` **and `pnpm build`** in the worktree first — the harness imports built `dist/`, so an unbuilt
workspace fails with `ERR_MODULE_NOT_FOUND` on `@pcpi/contracts/dist/index.js`. Never commit to `main` (it does
not exist) or to `feat/m0-seed`. **`git merge` may be denied by your session's permission classifier — you do not
need it, and you must not ask another agent to run one for you.**

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions, § Framework notes (the single-`z` rule matters here).
- `docs/milestones/M0-seed.md` — **§5 (the endpoint table you are completing)**, §3 (schema), §4 (DTOs and the
  error shape), §1 D3 (auth), D8 (identity/shelving), D9 (builds hold owned parts only).
- **The pattern to copy, in this order:** `apps/api/src/products/routes.ts` (W0.3 — the best example in the repo
  of zod-openapi routes with a query filter, a PATCH, token gating and 404s), then
  `apps/api/src/builds/routes.ts` and `apps/api/src/parts/routes.ts` (what you are extending),
  `apps/api/src/auth.ts`, `apps/api/src/dto.ts`, `apps/api/src/db/schema.ts`.
- `apps/api/test/pricing-routes.test.ts` — the API test pattern (token on/off, 404s, `app.request()`, no network).
- `~/.claude/playbook/multi-agent-playbook.md` §3, §6, §9.

## Recon (by the PM)
- **Exactly what is missing**, measured by diffing §5 against the 18-path generated spec:
  ```
  MISSING  POST   /parts                         MISSING  POST   /builds
  MISSING  GET    /parts/{id}                    MISSING  PATCH  /builds/{id}
  MISSING  PATCH  /parts/{id}                    MISSING  DELETE /builds/{id}
  MISSING  DELETE /parts/{id}                    MISSING  POST   /builds/{id}/items
  MISSING  DELETE /builds/{id}/items/{partId}
  present: GET /parts, GET /builds, GET /builds/{id}
  ```
  **RESOLVED 2026-09-05** — this recon snapshot is historical. All 12 §5 parts/builds entries are in the
  generated spec since W0.8 merged (`0876d43`), and `GET /parts` now declares `status`, `category`, `buildId`.
  Kept rather than deleted because it is the evidence for the coverage-check learning in the wave retro.
- **Plus the `GET /parts` filters.** §5 says `filter status, category, buildId`; `GET /parts` currently declares
  **no query parameters at all** (verified against the spec). `apps/api/src/products/routes.ts` shows the exact
  pattern — `request: { query: z.object({ category: Category.optional() }) }` then `c.req.valid('query')`.
  `category` lives on `products`, so filtering parts by it needs a join; `buildId` needs `build_items`.
- **Delete the stale comment.** `apps/api/src/parts/routes.ts:12` reads
  `// Filters (status, category, buildId) and the write endpoints in the §5 table are W0.3.` — that was never
  true; W0.3's brief did not include them. W0.3 correctly left it alone as out of its scope. Replace it with an
  accurate one.
- **`apps/web` already calls two of these** and currently fails at runtime:
  `apps/web/src/routes/builds/[id]/+page.server.ts` has `addItem`/`removeItem` form actions hitting
  `POST /builds/{id}/items` and `DELETE /builds/{id}/items/{partId}`, which 404 and surface as a 502. **Do not
  touch `apps/web`** — the polish brief wires it up after you merge. Just make the endpoints real and correct.
- Everything is green on your base: build, typecheck, `biome check .` (111 files), `pnpm test` (**142 passed**),
  and `pnpm harness --name m0 --fixture tools/scanner/fixtures/MOONPC.redacted.json` (9 checks, all §7 assertions
  pass). If any of that is red before you change anything, escalate rather than debug blindly.

## Contracts (architect-specified; satisfy exactly, and if one must change, escalate)
- **Request schemas for POST/PATCH derive from the §4 DTOs minus server fields** (no `id`, `ownerId`, `createdAt`,
  `updatedAt`, no computed fields). Put them in `packages/contracts` next to the DTOs. **PATCH is partial** — every
  field optional; an empty body is a no-op 200, not a 400.
- **`DELETE /parts/{id}`** refuses with **409** when the part is in a build, unless **`?force=1`**, which removes
  the `build_items` row first and then deletes the part.
- **`DELETE /builds/{id}`** **shelves** its parts (`status = 'on_shelf'`) — it **never deletes parts**. Removing
  the build removes `build_items`, not the hardware you own.
- **`POST /builds/{id}/items`** enforces one-build-per-part: if the part is already in a build, return **409**
  whose body includes **the current `buildId`** so a client can act on it. Moving a part between builds is
  delete-then-add (§5).
- **All mutating routes are token-gated per D3** (`API_TOKEN` set ⇒ `Authorization: Bearer` required; unset ⇒
  open). Reads stay open. Share routes are untouched.
- Every non-2xx uses the §4 error shape `{ error: { code, message, details? } }`.
- D9 holds: `build_items.partId` is NOT NULL — builds hold owned parts only.
- Money stays integer minor units (D6). `acquiredPriceCents` is an integer; reject a float or a string.

## Scope
**May edit:**
- `apps/api/src/parts/routes.ts`, `apps/api/src/builds/routes.ts` (add the endpoints + the filters; fix the stale comment)
- `packages/contracts/src/**` (the new request schemas) and the regenerated `packages/contracts/openapi.json`
  + `packages/contracts/generated/client.d.ts` — **run `pnpm gen` and commit the output** for this brief
- `apps/api/test/**` (your tests)

**Read-only:** everything else. **Do not touch `apps/web/**`** (the polish brief owns the wiring),
`apps/api/src/share/**`, `apps/api/src/pricing/**`, `apps/api/src/jobs/**`, `apps/api/src/products/routes.ts`,
`packages/core/**`, `tools/**`, `docker/**`, `compose.yaml`, `.github/**` (W0.6 is running right now), or root
config. `CLAUDE.md`, `README.md`, ADRs and `docs/**` are PM-owned — doc deltas go in your report's `Follow-ups`.
**No schema changes and no new migration** — §3 already has every column you need. If you believe you need one,
escalate; do not add it.

## Deliverables
1. **Parts:** `POST /parts`, `GET /parts/{id}`, `PATCH /parts/{id}`, `DELETE /parts/{id}` (with `?force=1`).
   `POST /parts` requires a `productId` that exists and belongs to the owner (404 otherwise) and defaults
   `status` to `on_shelf`, `quantity` to 1, `acquiredCurrency` to `USD` per §3.
   `PATCH /parts/{id}` must accept `acquiredPriceCents`, `acquiredAt`, `acquiredSource`, `condition`, `status`,
   `notes`, `serial` — **`acquiredPriceCents` is the one the milestone depends on; make sure it round-trips.**
2. **`GET /parts` filters:** `status`, `category` (join through `products`), `buildId` (join through
   `build_items`). Combinable. An unknown enum value is a 400 with the §4 error shape, not a silent empty list.
3. **Builds:** `POST /builds`, `PATCH /builds/{id}`, `DELETE /builds/{id}`.
   `POST /builds` generates a slug the same way the scan importer does (D7: 10-char lowercase base32, unique) and
   defaults `visibility` to `unlisted`, `source` to `'manual'`.
   `PATCH /builds/{id}` accepts `name`, `description`, `visibility`, and a **user-supplied `slug`** (D7 says
   user-overridable) — a duplicate slug is a **409**, not a 500. **This is what makes the §8 manual test's
   private→404 step performable, so make `visibility` definitely work.**
4. **Build items:** `POST /builds/{id}/items` `{ partId, slot? }` and `DELETE /builds/{id}/items/{partId}`, with
   the 409 rule above. 404 for an unknown build or part; 404 (not 500) when deleting an item that is not in that build.
5. **A named test per endpoint**, plus explicitly:
   - `DELETE /parts/{id}` → 409 while in a build; → 200 with `?force=1`, and the `build_items` row is gone
   - `DELETE /builds/{id}` → the build is gone, its parts still exist and are now `status='on_shelf'`
   - `POST /builds/{id}/items` for a part already in another build → 409 **and the body names the current buildId**
   - `PATCH /builds/{id}` with a duplicate slug → 409
   - `PATCH /parts/{id}` sets `acquiredPriceCents` and a subsequent `GET /builds/{id}/valuation` reflects it in
     `acquiredCents` — **this is the test that proves paid-vs-now works end to end; name it clearly**
   - token required on every mutating route when `API_TOKEN` is set (D3), open when unset

## Acceptance (named, runnable — paste the tails)
- [ ] `pnpm install && pnpm build` green
- [ ] `pnpm typecheck` green (0 errors)
- [ ] `pnpm lint` green (full repo)
- [ ] `pnpm test` green — quote the summary and name the six tests above
- [ ] `pnpm gen` → the spec now contains **all 12** §5 parts/builds entries; paste the path list and state the new
      total. Second run byte-identical (idempotent). Both generated files committed.
- [ ] `pnpm harness --name w08` → exit 0, counters quoted, **no regression** (expect the same figures as the base:
      productsCreated 6 / partsCreated 7 on the sample fixture)
- [ ] `pnpm harness --name w08-real --fixture tools/scanner/fixtures/MOONPC.redacted.json` → exit 0; quote
      `productsCreated=9, partsCreated=10, quotesRecorded=4, valuation.currentCents`
- [ ] **Prove paid-vs-now by hand**, since it is the point of this brief: against a booted API, import the real
      fixture, `PATCH /parts/{id}` an `acquiredPriceCents` onto two parts, then `GET /builds/{id}/valuation` and
      paste the before/after `acquiredCents`, `currentCents`, `deltaCents`. **`acquiredCents` must go from 0 to
      your two values summed.**

## Non-goals
- **No `apps/web` changes.** The build page's broken add/remove is wired up by the polish brief after you merge.
- No share-route changes, no valuation logic changes, no pricing/jobs changes, no `packages/core` changes.
- No schema change, no migration `0002`.
- No new dependencies. No Docker/CI (W0.6 owns it, running now).
- No auth beyond D3's existing token seam. No multi-owner filtering.
- Do not "improve" endpoints §5 does not list — no bulk endpoints, no PUT, no pagination.

## When to ask for help (escalation — one rung up only: the **PM (Opus)**)
`STATUS: ESCALATE` + the playbook §3 message, then stop, when: two failed attempts at the same sub-goal; §5's
semantics are ambiguous somewhere the architect's rules above do not settle; you need a schema change; a test can
only go green by weakening it; you need a file outside Scope; a toolchain failure survives one retry.

## Done definition
Playbook §9 report with real tails per gate, the spec path list, both harness runs' counters, the manual
paid-vs-now before/after figures, no TODOs, gate tails in the final commit message, work only on
`feat/m0-crud-endpoints`, doc deltas in `Follow-ups`.
