# M0 — Seed (wave plan)

*Architect: Fable, 2026-09-05. Executed by the `pm` agent (Opus): one brief per work item, Sonnet implements,
the PM validates and integrates on `feat/m0-seed` (branched from `feat/bootstrap`). Decisions in §1 are settled —
briefs point here instead of restating them, and no brief re-litigates them (escalate if one must change).*

**Outcome:** a running vertical slice on Austin's Windows box and in CI (ubuntu + windows): the PowerShell scanner
captures one of Austin's real machines → `POST /api/v1/imports/scans` creates products, parts and a build →
the fixture pricing provider records quotes → the build has a valuation (acquired vs. current, delta) → the build
is reachable as an SSR share page with OG tags, a Markdown export and a PNG card → `pnpm harness` proves all of it
with counters in `artifacts/harness/m0/report.json`, and `docker compose up` runs the same thing in two containers.

## 1. Settled decisions (ADR-0001 + intake pillars → concrete)

| # | Decision | Why |
|---|---|---|
| D1 | **TypeScript everywhere.** Node 22 LTS (installed: 22.14.0; 24 is a later drop-in), pnpm via corepack (`corepack enable pnpm`), pnpm workspace, TS strict. API = Hono + `@hono/zod-openapi`; DB = Drizzle (better-sqlite3 now; `drizzle-orm/postgres-js` later); web = SvelteKit 2 / Svelte 5 (adapter-node); tests = vitest; lint/format = Biome; PNG = satori + `@resvg/resvg-js`. **Exact version pins**, recorded in `CLAUDE.md` § Framework notes by the seed brief. | ADR-0001 |
| D2 | **The API is the product.** `apps/web` never imports Drizzle or touches the DB; it calls `apps/api` through the client generated from `/api/openapi.json`. Every UI feature is first an endpoint. | ADR-0001 |
| D3 | **`ownerId` on every root table** (`products`, `parts`, `builds`, `imports`, `jobs`). v1 has one owner, seeded at first run with id `local`. No auth UI; an `API_TOKEN` env var — when set, mutating routes require `Authorization: Bearer`; when unset (dev/harness), open. Share routes are always public. (§3 `jobs` corrected 2026-09-05 — architect.) | Pillar 4, R13 |
| D4 | **Product / Part split.** `Product` = catalog identity (what it is); `Part` = a physical unit you own (serial, condition, cost basis, status). Quotes attach to products so two identical GPUs cost one fetch. Products are owner-scoped in v1; a global catalog is a later ADR. | Pillar 2 |
| D5 | **Price quotes are append-only** (`price_quotes`). "Current value" is a query: latest quote per product with kind precedence `used_market > new_retail > msrp`; the response says which kind and how old. | Pillar 2 |
| D6 | **Money = integer minor units + ISO-4217 currency** (`priceCents`, `currency` default `USD`). No floats. | — |
| D7 | **Builds are shareable by slug.** `slug` = 10-char lowercase base32 nanoid, user-overridable, globally unique. `visibility`: `private \| unlisted \| public`, default **`unlisted`** (URL works; not listed). Web route `/b/{slug}`; API `GET /share/{slug}` (+ `.md`, `/card.png`). | Pillar 3 |
| D8 | **Scan import is idempotent.** Identity key per component: `serial` if present, else `(category, manufacturer, model, slot)`. Re-scanning a host updates in place; components missing from a later scan are marked `status = on_shelf` (never deleted). One build per `hostname` is auto-created (`name = hostname`, `source = 'scan'`) and scanned parts are placed in it. | Pillar 1 |
| D9 | **Builds hold owned parts only** in v1 (`build_items.partId` NOT NULL). Wishlist/planned items are a later, additive table. | Non-goals |
| D10 | **Jobs run in-process** over a `jobs` table (SQLite-safe): kinds `price_refresh`, `import_process`. A tick loop every 30 s in the API; `POST /jobs/run-due` runs the loop once and is enabled only when `HARNESS=1` or `NODE_ENV=development` (determinism for the harness). pg-boss when on Postgres — later. | R4, R10 |
| D11 | **Providers are plugins** behind one interface (§4). M0 ships `fixture` (reads `fixtures/quotes.json`) and `bestbuy` (real, `BESTBUY_API_KEY`, tested against recorded HTTP). Provider ↔ product matching is stored (`provider_links`) with a confidence and a `verified` flag; the refresh job only quotes verified links *or* links with confidence ≥ 0.9. | Pillar 2, research 2026-09-05 |
| D12 | **Harness = the integration gate.** `pnpm harness --name <n>` boots the API on a temp SQLite file with `HARNESS=1` and the fixture provider, posts the real (redacted) scan fixture, runs due jobs, fetches share JSON / HTML / MD / PNG, asserts the counters in §6, writes `artifacts/harness/<n>/{report.json,card.png,share.html}`. Every evidence row quotes the counters (playbook learning 26). | R10 |
| D13 | **Two containers** (`api`, `web`), `compose.yaml` with a **named volume** for SQLite (never a bind mount — WSL2 locking), `postgres` profile present but exercised in M2. Distroless/`node:22-slim` images. | R2, R12 |
| D14 | **CI on ubuntu + windows** runs every gate including the harness; the PNG and `report.json` are uploaded as artifacts. First green CI is part of M0's done-definition. | R12, learning 8 |
| D15 | **Real hardware is the evidence.** The harness fixture is a redacted scan of one of Austin's machines (`tools/scanner/fixtures/<hostname>.redacted.json`), captured by W0.2. Until it exists, W0.1 uses `fixtures/scan.sample.json` written by hand to the same contract. | learning 26 |

## 2. Layout

```
apps/api/                 Hono + zod-openapi; Drizzle schema + migrations; job runner; share exports (md, png)
apps/web/                 SvelteKit (SSR, adapter-node); generated API client; /b/{slug}; inventory + build pages
packages/contracts/       zod schemas: domain, ScanPayload, API DTOs; `pnpm --filter contracts gen` writes openapi.json + client types
packages/core/            pure domain, no I/O: scan normalization, valuation, PricingProvider interface, fixture provider
tools/scanner/            scan.ps1 (Windows CIM → ScanPayload JSON; optional POST); fixtures/*.redacted.json
tools/harness/            harness.ts (D12)
docker/                   Dockerfile.api, Dockerfile.web; compose.yaml at repo root
.github/workflows/ci.yml  D14
artifacts/                gitignored evidence
```

Root scripts (`package.json`): `build`, `typecheck`, `test`, `lint`, `harness`, `dev` (api :3000 + web :5173), `gen` (contracts → openapi + client).

## 3. Data model (Drizzle; one schema, both dialects)

```ts
owners        { id: text pk, name: text, createdAt }
products      { id: text pk, ownerId → owners, category: enum, manufacturer: text, model: text,
                partNumber: text?, upc: text?, specs: json, createdAt, updatedAt }
                unique (ownerId, partNumber) where partNumber not null; unique (ownerId, upc) where upc not null
parts         { id: text pk, ownerId, productId → products, serial: text?, condition: enum('new','used','refurbished','broken'),
                quantity: int default 1, status: enum('in_build','on_shelf','sold','disposed') default 'on_shelf',
                acquiredAt: date?, acquiredPriceCents: int?, acquiredCurrency: text default 'USD', acquiredSource: text?,
                soldAt: date?, soldPriceCents: int?, importId → imports?, identityKey: text (D8), notes: text?, createdAt, updatedAt }
                unique (ownerId, identityKey)
builds        { id: text pk, ownerId, slug: text unique, name: text, description: text?, source: enum('scan','manual'),
                hostname: text?, visibility: enum('private','unlisted','public') default 'unlisted', createdAt, updatedAt }
build_items   { buildId → builds, partId → parts unique, slot: text?, addedAt }   // a part is in at most one build
provider_links{ id, productId, provider: text, externalId: text, url: text?, confidence: real, verified: bool default false, createdAt }
                unique (productId, provider, externalId)
price_quotes  { id, productId, providerLinkId?, provider: text, kind: enum('new_retail','used_market','msrp','manual'),
                priceCents: int, currency: text, observedAt: timestamp, sourceUrl: text?, raw: json? }   // append-only
imports       { id, ownerId, kind: enum('scan','order_csv','manual'), source: text, payloadHash: text unique, payload: json,
                status: enum('received','processed','failed'), summary: json?, receivedAt, processedAt? }
jobs          { id, ownerId → owners, kind: text, runAt: timestamp, status: enum('queued','running','done','failed'), attempts: int, payload: json, lastError: text? }
```

`category` enum (matches PCPartPicker's vocabulary): `cpu, cpu_cooler, motherboard, memory, storage, gpu, case, psu,
case_fan, monitor, os, keyboard, mouse, headset, other`.

## 4. Contracts (zod, in `packages/contracts`; the seed creates these verbatim)

**ScanPayload v1** — what every scanner emits and `POST /imports/scans` accepts:
```ts
ScanComponent = { category, manufacturer: string, model: string, partNumber?: string, serial?: string | null,
                  quantity?: number (default 1), slot?: string, specs: Record<string, string | number | boolean | null> }
ScanPayload   = { schemaVersion: 1, scanner: { name: string, version: string, os: 'windows' | 'macos' | 'linux' },
                  host: { hostname: string, scannedAt: ISO-8601 string }, components: ScanComponent[] }
```
Expected `specs` keys by category (all optional; scanners emit what the OS exposes): cpu `cores, threads, maxClockMHz, socket`;
gpu `vramMB, driverVersion`; memory `capacityMB, speedMT, formFactor`; storage `capacityBytes, bus, mediaType, firmware`;
motherboard `biosVersion, chipset`; monitor `widthPx, heightPx, manufactureYear`.

**API DTOs** (response shapes; request shapes are the same minus server fields):
`Owner`, `Product`, `Part` (+ `product`), `Build` (+ `items: (BuildItem & { part, product })[]`), `ProviderLink`, `PriceQuote`,
`Import` (+ `summary: { productsCreated, productsUpdated, partsCreated, partsUpdated, partsShelved, buildId }`),
`Valuation = { buildId, currency, acquiredCents, currentCents, deltaCents, deltaPct, items: { partId, acquiredCents?, currentCents?, quote?: { kind, provider, observedAt, ageDays } }[] }`,
`SharedBuild = { slug, name, description?, updatedAt, currency, items: { category, manufacturer, model, quantity, currentCents? }[], valuation?: { acquiredCents, currentCents, deltaCents } }` (currency added 2026-09-05 — architect)
**Share item order** (and `GET /builds/{id}` items) is deterministic: category in the display order of the §3 enum
(`cpu, cpu_cooler, motherboard, memory, storage, gpu, case, psu, case_fan, monitor, os, keyboard, mouse, headset,
other`), then manufacturer, then model, then quantity descending. Sorted **once, in the API**, so JSON, page, MD
and PNG always agree. (item order added 2026-09-05 — architect)
(share responses never include serials, notes, acquiredSource or owner data).

**Error shape** (all non-2xx): `{ error: { code: string, message: string, details?: unknown } }`.

**PricingProvider** (`packages/core`):
```ts
interface PricingProvider {
  readonly id: string;                       // 'fixture' | 'bestbuy' | ...
  readonly kinds: QuoteKind[];
  search(identity: { category, manufacturer, model, partNumber?, upc? }): Promise<{ externalId, url?, title, confidence: number }[]>;
  quote(link: { externalId }): Promise<{ kind: QuoteKind, priceCents: number, currency: string, sourceUrl?: string, raw?: unknown } | null>;
}
```

## 5. API surface v1 (`/api/v1`, OpenAPI at `/api/openapi.json`, Scalar at `/api/docs`)

| Method + path | Auth | Notes |
|---|---|---|
| `GET /health` | – | `{ ok: true, version, db: 'sqlite' \| 'postgres' }` |
| `GET /products`, `GET /products/{id}`, `PATCH /products/{id}` | read: –, write: token | filter `category` |
| `GET /products/{id}/quotes` | – | newest first, `?kind=` |
| `POST /products/{id}/refresh` | token | enqueues `price_refresh`; 202 `{ jobId }` |
| `GET /products/{id}/links`, `POST …/links` (manual link), `PATCH …/links/{linkId}` (`verified`) | token on write | D11 |
| `GET /parts`, `POST /parts`, `GET /parts/{id}`, `PATCH /parts/{id}`, `DELETE /parts/{id}` | token on write | filter `status`, `category`, `buildId` |
| `GET /builds`, `POST /builds`, `GET /builds/{id}`, `PATCH /builds/{id}`, `DELETE /builds/{id}` | token on write | |
| `POST /builds/{id}/items` `{ partId, slot? }`, `DELETE /builds/{id}/items/{partId}` | token | moving a part between builds = delete + add |
| `GET /builds/{id}/valuation` | – | D5 |
| `POST /imports/scans` (body: ScanPayload) | token | 201 `Import` with `summary`; idempotent on `payloadHash` (200 on replay) |
| `GET /imports/{id}` | – | |
| `GET /share/{slug}` · `GET /share/{slug}.md` · `GET /share/{slug}/card.png` | public | 404 for `private`; MD = PCPartPicker-style table; PNG = 1200×630 card |
| `GET /providers` | – | ids + configured flag |
| `POST /jobs/run-due` | token; only when `HARNESS=1` or dev | D10 |

## 6. Work items

Order: **W0.1 and W0.2 in parallel** (disjoint) → PM accepts W0.1 → **W0.3, W0.4, W0.5 in parallel** (disjoint dirs) →
**W0.6** → integration gate. Worktrees: `d:\pc-parts-inventory-wt\<slug>` on branch `feat/m0-<slug>` from `feat/m0-seed`.

### W0.1 `seed-workspace-api` (Sonnet; **first; proves the toolchain**)
Goal: the workspace builds, tests, lints and type-checks on Windows; the API boots; a scan imports; a build is readable.
- pnpm workspace + root scripts; Biome; TS strict `tsconfig.base.json`; Node 22 in `.nvmrc`/`engines` (`>=22.14`); pnpm bootstrapped with `corepack enable pnpm` (not preinstalled); **recon step: `npm view <pkg> version` for every dependency and pin exact** (record the pins + Svelte-5/Drizzle/zod notes in a `CLAUDE.md` § Framework notes delta for the PM).
- `packages/contracts`: §4 schemas + `gen` script (writes `openapi.json` from the API's registry and `client.d.ts` via `openapi-typescript`).
- `packages/core`: `normalizeScan(payload) → { products, parts, identityKeys }` (D8), `valuate(...)` (D5) — pure, unit-tested with `fixtures/scan.sample.json` (hand-written, ≥ 6 components incl. 2 identical memory sticks with different serials and 1 storage with serial).
- `apps/api`: Hono + zod-openapi app; Drizzle schema §3 + first migration + `migrate` on boot; owner `local` seeded; `GET /health`, `POST /imports/scans`, `GET /imports/{id}`, `GET /builds`, `GET /builds/{id}`, `GET /parts`, `GET /products`, `GET /share/{slug}` (JSON only), `API_TOKEN` middleware; error shape.
- `tools/harness/harness.ts` v0: boots API on a temp DB, posts the sample scan twice (second must be idempotent 200), asserts `partsCreated == 7`, `productsCreated == 6` (whatever the sample implies — state the numbers in the test), `GET /share/{slug}` has the items; writes `report.json`.
- Acceptance: `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test && pnpm harness --name w01` all green on Windows; `report.json` counters quoted.

### W0.2 `scanner-ps1` (Sonnet; parallel with W0.1; scope `tools/scanner/**` + `packages/contracts/fixtures/**`)
Goal: `tools/scanner/scan.ps1` emits a valid ScanPayload for a Windows machine.
- `Get-CimInstance` over `Win32_Processor`, `Win32_VideoController`, `Win32_PhysicalMemory` (per stick, `DeviceLocator` → `slot`, `SerialNumber`, `PartNumber`), `MSFT_PhysicalDisk` (`root/Microsoft/Windows/Storage`; `SerialNumber`, `BusType`, `MediaType`, `Size`), `Win32_BaseBoard` + `Win32_BIOS`, `WmiMonitorID` (`root/wmi`; decode the uint16 arrays), `Win32_ComputerSystem` for hostname. **Windows PowerShell 5.1 is the only PowerShell on Austin's box (no `pwsh`)** — 5.1 compatibility is required, 7 is a bonus; no modules.
- Params: `-OutFile`, `-ApiUrl`, `-Token`, `-RedactSerials` (replaces serials with `sha256(serial)[0:12]`), `-Pretty`.
- Manufacturer/model cleanup rules (strip "Corporation", "(R)", "(TM)", trailing whitespace; memory manufacturer from JEDEC id when `Manufacturer` is a number) — unit-testable as a separate `.ps1` function file + Pester tests **if Pester is present**, otherwise a `-SelfTest` switch with inline assertions.
- Acceptance: runs on Austin's machine (the PM asks Austin via the architect if the agent cannot — the sandbox may not expose WMI) → `tools/scanner/fixtures/<hostname>.redacted.json` validates against the contracts schema (`pnpm --filter contracts validate <file>` — add that tiny script in this brief's scope). Evidence: the JSON, component count, categories present.

### W0.3 `pricing-and-jobs` (Sonnet; after W0.1; scope `packages/core/src/pricing/**`, `apps/api/src/pricing/**`, `apps/api/src/jobs/**`, routes for products/links/refresh/valuation/jobs)
- `PricingProvider` interface; `fixture` provider (`fixtures/quotes.json` keyed by `partNumber` or `manufacturer|model`); `bestbuy` provider (Products API `search` + `products/{sku}` with `apiKey`; recorded responses under `apps/api/test/recordings/bestbuy/*.json`; **no live calls in tests**).
- Jobs table + runner (D10); `price_refresh` job: for each verified/high-confidence link → `quote` → append `price_quotes`. `POST /products/{id}/refresh`, `POST /jobs/run-due`, `GET /products/{id}/quotes`, links endpoints, `GET /builds/{id}/valuation`.
- Harness delta: after import, `POST /jobs/run-due` with `PRICING_PROVIDERS=fixture` → `quotesRecorded ≥ 1` per fixture-matched product; `valuation.deltaCents` computed; counters in `report.json`.
- Acceptance: gates green; harness counters quoted; a unit test proves D5's precedence and age.

### W0.4 `web-share-and-inventory` (Sonnet; after W0.1; scope `apps/web/**`)
- SvelteKit 2 / Svelte 5 (runes), adapter-node, TS strict, `svelte-check` in `typecheck`. API client = `openapi-fetch` over `packages/contracts` generated types; base URL from `API_URL` env (server) — **no Drizzle, no DB**.
- Routes: `/` inventory (parts table: category, product, serial, condition, status, acquired, current, delta), `/builds` list, `/builds/[id]` (items + valuation; add/remove part via form actions), `/b/[slug]` **share page**: SSR, readable with JS disabled, `<title>`, `og:title/description/image` (image = `/api/v1/share/{slug}/card.png`), "copy Markdown" button, 404 for private/unknown.
- Harness delta: fetch `/b/{slug}` from the web server → assert 200, OG tags present, every item's model text present; save `share.html`.
- Acceptance: gates green (incl. `svelte-check` 0 errors); harness counters; the PM reads `share.html`.

### W0.5 `exports-md-png` (Sonnet; after W0.1; parallel with W0.3/W0.4; scope `apps/api/src/share/**`)
- `GET /share/{slug}.md`: PCPartPicker-style Markdown table (Type · Item · Price) + totals + "Generated by …" footer.
- `GET /share/{slug}/card.png`: satori (JSX-free object tree) → SVG → `@resvg/resvg-js` PNG, 1200×630, bundled font (Inter, OFL) under `apps/api/assets/`; shows name, up to 8 items, acquired vs. current, delta; cached by `updatedAt` ETag.
- Harness delta: fetch both; assert MD has one row per item; PNG > 10 KB; save `card.png`. **The PM reads the PNG.**

### W0.6 `containers-and-ci` (Sonnet; last; scope `docker/**`, `compose.yaml`, `.github/**`, `apps/*/Dockerfile` if preferred, root `.dockerignore`)
- `Dockerfile.api` (multi-stage; `node:22-slim` runtime or distroless; `HEALTHCHECK` on `/health`), `Dockerfile.web` (adapter-node build). `compose.yaml`: `api` (volume `pcpi-data:/data`, `DATABASE_URL=file:/data/pcpi.db`), `web` (`API_URL=http://api:3000`), ports 3000/5173→3000/3001; `postgres` profile stub (service + env, not exercised).
- CI: `ubuntu-latest` + `windows-latest` matrix → install, build, typecheck, lint, test, harness; upload `artifacts/harness/**`; `docker compose build` on ubuntu.
- Acceptance: `docker compose up --build` on Austin's box serves `/b/{slug}` from the container (PM verifies with `curl`), CI green on both OSes (link + tails in the report).

## 7. Integration gate (PM runs after W0.6 on `feat/m0-seed`)

`pnpm harness --name m0 --fixture tools/scanner/fixtures/<hostname>.redacted.json` with the **real redacted scan**
(D15) → `artifacts/harness/m0/report.json` must show: `importsIdempotent: true`, `productsCreated ≥ 5`,
`partsCreated ≥ 6`, `buildsCreated: 1`, `quotesRecorded ≥ 2`, `share.html.ogTags: 4`, `share.md.rows == items`,
`card.png.bytes > 10000`. The PM reads `card.png` and `share.html` and quotes what it saw. Then
`docker compose up --build` + `curl` the share page.

**The gate reads money from the artifacts, never from the endpoint** (revised 2026-09-05 — architect; the original
asserted `valuation.currentCents > 0` against `GET /builds/{id}/valuation` and so passed while every user-visible
artifact rendered em-dashes). Before the share fetches, the harness `PATCH`es `acquiredPriceCents` onto **≥ 2 parts**
of the imported build, with values from `packages/contracts/fixtures/cost-basis.json` keyed by `identityKey`
(fewer than 2 matches fails the check). It then asserts, from the share payload and exports:
`share.json.valuation.acquiredCents > 0`, `share.json.valuation.currentCents > 0`,
`share.json.valuation.deltaCents != 0`, `share.md` contains **at least two non-dash prices and a totals line**, and
`share.json.items` is **identical across two runs** (the item-order rule above). **`card.png` must show a total, not
"Valuation not available yet"** — that image is this milestone's outcome sentence, paid-vs-now, proven end to end.

## 8. Manual test guide (PM writes `docs/process/test-guides/m0.md`)

Must cover: run `scan.ps1` on a second machine → it appears as a build; open `/b/{slug}` in a browser and paste the
URL into Discord (unfurl shows the card); "copy Markdown" → paste into a Reddit comment preview; edit a part's
acquired price → valuation delta changes; `docker compose up` cold start.

## 9. Toolchain facts on Austin's box (2026-09-05)

Node v22.14.0 · npm 10.9.2 · **pnpm not installed** (use corepack) · Docker 29.6.1 · **Windows PowerShell 5.1 only** (no pwsh) ·
Git Bash is the agents' shell (`Bash` tool); `powershell -NoProfile -File tools/scanner/scan.ps1 …` runs the scanner. The
implementer for W0.2 runs the scan on this machine; if CIM is blocked in the sandbox, the PM escalates and the architect asks Austin.

## 10. Out of scope for M0 (M1/M2)

Order-history importers (M1), barcode capture (M1), scheduled refresh cadence UI (M1), Keepa/eBay providers (M1+),
PWA manifest (M2), Postgres exercised (M2), auth beyond the token seam (later ADR), wishlist items (later ADR),
cross-platform scanner binary (M1 decision, ADR-0001 § Consequences).
