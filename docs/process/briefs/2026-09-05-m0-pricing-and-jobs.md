# Brief: m0-pricing-and-jobs  (2026-09-05, tier: sonnet, author: pm, wave: M0 Seed / W0.3)

**Goal (one sentence):** Pluggable pricing providers (`fixture` + `bestbuy`), an in-process job runner over the
`jobs` table, and the endpoints that turn them into a build valuation — so a scanned build shows *paid vs. now*.

**Why / where it fits:** W0.3 of `docs/milestones/M0-seed.md` §6, running **in parallel with W0.4 and W0.5** on
top of the merged W0.1 seed. Pillar 2 — *price delta is first-class; every quote we fetch is recorded and the
history table is ours regardless of which provider we can reach this month.*

## Worktree and branch (work only here)

```
worktree: d:\pc-parts-inventory-wt\pricing-and-jobs
branch:   feat/m0-pricing-and-jobs   (created from feat/m0-seed AFTER W0.1 merged — the seed is present)
```
Run `pnpm install` in the worktree first (each worktree has its own `node_modules`). Never commit to `main`
(it does not exist) or to `feat/m0-seed`.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions, § Framework notes (pinned versions + gotchas, filled in by W0.1).
- `docs/milestones/M0-seed.md` — **§1 D5, D10, D11 (settled), §3 (`provider_links`, `price_quotes`, `jobs`
  tables), §4 (`PricingProvider`, `PriceQuote`, `ProviderLink`, `Valuation` DTOs), §5 (the endpoint table)**, §6 W0.3.
- The merged seed, in this order: `packages/core/src/pricing/index.ts` (the interface W0.1 wrote), the existing
  `packages/core` valuation code and its tests, `apps/api/src/app.ts` (how modules are mounted),
  `apps/api/src/products/routes.ts` and `apps/api/src/imports/routes.ts` (the route + zod-openapi pattern to
  copy), `apps/api/src/db/schema.ts`, `tools/harness/harness.ts` + `tools/harness/checks/` (the check-module
  pattern and the `report.json` counter contract).
- `~/.claude/playbook/multi-agent-playbook.md` §3, §6, §9.

## Recon (by the PM)
- **The seams are already there — use them, do not rebuild them.** W0.1 pre-created and pre-mounted
  `apps/api/src/pricing/routes.ts` and `apps/api/src/jobs/routes.ts` as **empty routers**. Fill those files in.
  **You must not edit `apps/api/src/app.ts`** — W0.5 is editing its own module in parallel and `app.ts` is the one
  file that would conflict. If you believe you need a new mount point, escalate instead.
- Same rule for the harness: **add exactly one new file** `tools/harness/checks/30-pricing.ts`. Checks are
  discovered by reading the directory, so there is no registry to edit. W0.4 adds `40-web.ts` and W0.5 adds
  `50-exports.ts` at the same time; do not touch theirs, do not touch `harness.ts`.
- `report.json` counters you own (W0.1 seeded them at zero — fill them, do not rename them):
  `counters.quotesRecorded`, `counters.valuation.{acquiredCents,currentCents,deltaCents}`.
- **`packages/contracts/openapi.json` and `packages/contracts/generated/client.d.ts` are generated.** You may run
  `pnpm gen` locally to keep yourself honest, but expect the PM to regenerate and re-commit them at integration;
  do not hand-edit them, and do not be surprised by a conflict there (the PM resolves it by regenerating).
- D6 is absolute: **integer minor units only.** A provider returning `"249.99"` becomes `24999`. Parse with a
  string→cents helper and unit-test the rounding; never `Math.round(x*100)` on a float you got from `JSON.parse`
  of a price string. Put the helper in `packages/core` next to the valuation code and test it with
  `"0.10"`, `"249.99"`, `"1049.00"`, `"1,299.99"`, `249.99` (number), and a missing/`null` price.
- Best Buy's Products API shape (from the intake research, 2026-09-05): search is
  `https://api.bestbuy.com/v1/products((search=<term>))?apiKey=…&format=json&show=sku,name,salePrice,regularPrice,manufacturer,modelNumber,upc,url&pageSize=10`
  and a single product is `https://api.bestbuy.com/v1/products(sku=<sku>)?apiKey=…&format=json&show=…`.
  Prices are decimal **dollars** in JSON (e.g. `salePrice: 249.99`) → `new_retail`. **Record the exact request
  URL shape you implement in a comment**, and drive the tests only from checked-in recordings.
- The `bestbuy` provider is **never called live in tests or in the harness.** `GET /providers` reports it as
  `configured: false` when `BESTBUY_API_KEY` is unset, which is the normal state on this machine and in CI.

## Contracts (satisfy exactly; if one must change, escalate)

`PricingProvider` from §4, already declared by W0.1 in `packages/core/src/pricing/index.ts`:
```ts
interface PricingProvider {
  readonly id: string;                       // 'fixture' | 'bestbuy'
  readonly kinds: QuoteKind[];
  search(identity: { category, manufacturer, model, partNumber?, upc? }):
      Promise<{ externalId: string, url?: string, title: string, confidence: number }[]>;
  quote(link: { externalId: string }):
      Promise<{ kind: QuoteKind, priceCents: number, currency: string, sourceUrl?: string, raw?: unknown } | null>;
}
```
Tables `provider_links`, `price_quotes`, `jobs` exactly as §3 (already migrated by W0.1). `price_quotes` is
**append-only** (D5) — never `UPDATE`, never `DELETE`. DTOs `ProviderLink`, `PriceQuote`, `Valuation` exactly as §4.

**D11 gating rule, verbatim:** the refresh job quotes only links that are `verified === true` **or** have
`confidence >= 0.9`. **D5 precedence:** latest quote per product, kind precedence `used_market > new_retail >
msrp` (W0.1 chose where `manual` sits — read its test and follow it), and the response says which kind and how
old (`ageDays`).

## Scope
**May edit / create:**
- `packages/core/src/pricing/**` (providers, matching, the money parser) and its tests
- `apps/api/src/pricing/**` (routes + provider registry wiring), `apps/api/src/jobs/**` (runner + routes)
- `apps/api/src/products/routes.ts` — **add only** `GET /products/{id}`, `PATCH /products/{id}`,
  `GET /products/{id}/quotes`, `POST /products/{id}/refresh`, `GET /products/{id}/links`, `POST /products/{id}/links`,
  `PATCH /products/{id}/links/{linkId}`
- `apps/api/src/builds/routes.ts` — **add only** `GET /builds/{id}/valuation`
- `apps/api/test/recordings/bestbuy/*.json` and `apps/api/test/**` for your tests
- `packages/core/fixtures/quotes.json` (the fixture provider's data)
- `tools/harness/checks/30-pricing.ts` (**new file only**)

**Read-only:** everything else — in particular `apps/api/src/app.ts`, `apps/api/src/share/**` (W0.5),
`apps/web/**` (W0.4), `tools/harness/harness.ts`, `tools/scanner/**`, root config files, `CLAUDE.md`, `docs/**`.
Shared docs are PM-owned during fan-out: doc deltas go in your report's `Follow-ups`.

## Deliverables
1. **Providers** (`packages/core/src/pricing/`):
   - `fixture` — reads `packages/core/fixtures/quotes.json`, keyed by `partNumber` first, else
     `` `${manufacturer}|${model}` `` (case-insensitive, whitespace-normalised). It must **match at least two
     products from the real MOONPC scan fixture** (`tools/scanner/fixtures/MOONPC.redacted.json` — read it and
     key on what is actually in it: the G.SKILL `F5-6000J3036G32G` memory, the `CT2000T700SSD5` SSD, the
     `NVIDIA GeForce RTX 4070 Ti SUPER`, the `AMD Ryzen 7 9800X3D`). This is what makes the §7 integration gate's
     `quotesRecorded >= 2` true — **the fixture data is your responsibility, not the harness's**.
   - `bestbuy` — real implementation, `BESTBUY_API_KEY` from env, `search()` + `quote()`, sensible
     confidence scoring (exact `modelNumber`/`upc` match ⇒ ≥ 0.9; fuzzy title match ⇒ lower), a timeout, and
     graceful degradation to `[]`/`null` on non-2xx. Tested **only** against
     `apps/api/test/recordings/bestbuy/*.json` via an injected `fetch` — **no network in any test**.
   - A registry: `PRICING_PROVIDERS` env (comma-separated, default `fixture`) selects which are active.
     `GET /providers` returns `{ id, kinds, configured }[]`.
2. **Jobs (D10).** A runner over the `jobs` table: `claim → run → done|failed` with `attempts` and `lastError`,
   safe under SQLite (single writer; claim inside a transaction). Kinds `price_refresh` and `import_process`
   (`import_process` may be a thin pass-through in M0 — say so). A 30 s tick loop started with the API server,
   **disabled under `HARNESS=1` and in tests** so runs are deterministic. `POST /jobs/run-due` runs the loop
   exactly once and returns what it did; it is **only mounted when `HARNESS=1` or `NODE_ENV=development`**, and
   returns 404 otherwise — write a test for the 404 case.
3. **`price_refresh`**: for each product's links that pass the D11 gate → `provider.quote()` → **append** a row to
   `price_quotes`. No link for a product yet? The job first runs `provider.search()` and stores the best match as
   a `provider_link` with its confidence and `verified: false`. Never overwrite a `verified: true` link.
4. **Endpoints** (§5, auth per D3 — token on writes, open on reads):
   `GET /products/{id}`, `PATCH /products/{id}`, `GET /products/{id}/quotes` (newest first, `?kind=` filter),
   `POST /products/{id}/refresh` → **202 `{ jobId }`**, `GET|POST /products/{id}/links`,
   `PATCH /products/{id}/links/{linkId}` (`verified`), `GET /builds/{id}/valuation`, `POST /jobs/run-due`,
   `GET /providers`. All registered on the OpenAPI registry like the seed's routes, all returning the §4 error shape.
5. **Harness check `tools/harness/checks/30-pricing.ts`**: with `PRICING_PROVIDERS=fixture`, after the import —
   `POST /jobs/run-due`, then assert `quotesRecorded >= 1` per fixture-matched product and ≥ 2 overall; fetch
   `GET /builds/{buildId}/valuation` and assert `currentCents > 0` and that `deltaCents === currentCents -
   acquiredCents`; write `counters.quotesRecorded` and `counters.valuation.*` into `report.json`.
6. **Unit tests that prove the decisions**, named in your report:
   - D5 precedence: three quotes of different kinds for one product ⇒ the `used_market` one wins; `ageDays` is
     computed from `observedAt`; a stale-but-higher-precedence quote still wins (state the intended behaviour).
   - D11 gating: a link with `confidence 0.5, verified false` is **not** quoted; `0.5 + verified true` is;
     `0.95 + verified false` is.
   - D5 append-only: refreshing twice leaves two rows, and the older one is untouched.
   - The money parser cases listed in Recon.

## Acceptance (named, runnable — paste the tails)
- [ ] `pnpm install` then `pnpm build` green
- [ ] `pnpm typecheck` green (0 errors)
- [ ] `pnpm lint` green
- [ ] `pnpm test` green — name the D5, D11, append-only and money-parser tests and quote the vitest summary line
- [ ] `pnpm gen` runs clean (the new endpoints appear in `openapi.json`); say how many paths the spec now has
- [ ] `pnpm harness --name w03` → exit 0; **quote from `artifacts/harness/w03/report.json`**: `quotesRecorded`,
      `valuation.acquiredCents`, `valuation.currentCents`, `valuation.deltaCents`, plus the W0.1 counters to prove
      you did not regress them
- [ ] A test proves `POST /jobs/run-due` 404s when neither `HARNESS=1` nor `NODE_ENV=development`
- [ ] No network in tests: show that the bestbuy tests inject a stub `fetch` (quote the injection line)

## Non-goals
- No Keepa, no eBay, no scheduled-refresh cadence UI (M1). No Postgres/pg-boss (M2) — the runner stays SQLite-safe.
- No web UI of any kind. No Markdown/PNG exports (W0.5). No Dockerfiles or CI (W0.6).
- Do not edit `apps/api/src/app.ts`, `tools/harness/harness.ts`, or any file W0.4/W0.5 own.
- Do not change the `price_quotes`/`provider_links`/`jobs` schema. If §3 is genuinely insufficient, **escalate**.
- Do not make live HTTP calls anywhere in the test or harness path.
- Do not hand-edit generated files (`openapi.json`, `generated/client.d.ts`).

## When to ask for help (escalation — one rung up only: the **PM (Opus)**)
`STATUS: ESCALATE` + the playbook §3 message, then stop, when: two failed attempts at the same sub-goal; §3/§4/§5
as written cannot be implemented; you need to touch a file outside Scope (especially `app.ts` or `harness.ts`);
a test can only go green by weakening it; a toolchain failure survives one retry.

## Done definition
Playbook §9 report with real output tails per gate, `artifacts/harness/w03/report.json` counters quoted, no TODOs,
gate tails in the final commit message, work only on `feat/m0-pricing-and-jobs`, doc deltas in `Follow-ups`.

---

## PM addendum (2026-09-05, after validating and merging W0.1 — read this, it is not optional)

The seed is merged. Three clarifications so you never need to touch `apps/api/src/app.ts`:

1. **Route module → mount point, as W0.1 actually built it.** `app.ts` mounts eight modules under `/api/v1`:
   `health`, `imports`, `builds`, `parts`, `products`, `share`, **`pricing/routes.ts` at `/providers`**, and
   **`jobs/routes.ts` at `/jobs`**. So:
   - `GET /providers` goes in `apps/api/src/pricing/routes.ts` (it is already mounted at that path).
   - `POST /jobs/run-due` goes in `apps/api/src/jobs/routes.ts`.
   - **The product-scoped pricing endpoints are NOT served from the pricing module.**
     `GET /products/{id}/quotes`, `POST /products/{id}/refresh` and the `…/links` routes go in
     `apps/api/src/products/routes.ts`; `GET /builds/{id}/valuation` goes in `apps/api/src/builds/routes.ts`.
     Both files are in your Scope as **add-only**. The contract is the §5 path, not the module layout.
   - Non-route pricing code (the provider registry, the fixture/bestbuy providers' API-side wiring) can live in
     other files under `apps/api/src/pricing/` — only the *router* file is mount-bound.
2. **Import `z` from `packages/contracts/src/z.ts` (re-exported by the package index), never from `zod`.**
   `@hono/zod-openapi` decorates `z` with `.openapi()`; a bare `zod` import silently loses that metadata and your
   routes will be missing from the spec. See `CLAUDE.md` § Framework notes.
3. **The real scan is now on the wave branch**: `tools/scanner/fixtures/MOONPC.redacted.json`, 10 components →
   **9 products / 10 parts**. Verified by the PM through the booted API. Key your `fixtures/quotes.json` off what
   is really in there — the exact strings are: `AMD`/`Ryzen 7 9800X3D`, `NVIDIA`/`GeForce RTX 4070 Ti SUPER`,
   `AMD`/`Radeon Graphics`, `G.SKILL`/`F5-6000J3036G32G` (partNumber `F5-6000J3036G32G`),
   `Crucial`/`CT2000T700SSD5`, `Gigabyte`/`B650 EAGLE AX`, `Dell`/`AW3423DWF`, `Acer`/`ED323QUR A`,
   `BenQ`/`XL2430T`. Note the models do **not** repeat the manufacturer — match on that form.
