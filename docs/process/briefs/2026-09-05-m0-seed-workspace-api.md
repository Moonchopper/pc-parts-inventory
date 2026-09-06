# Brief: m0-seed-workspace-api  (2026-09-05, tier: sonnet, author: pm, wave: M0 Seed / W0.1)

**Goal (one sentence):** Stand up the pnpm workspace, the contracts package, the pure core, the Hono+Drizzle API
and the harness so that `pnpm install && build && typecheck && lint && test && harness` are all green on Windows
and a hand-written sample scan imports into products/parts/a build that is readable at `GET /share/{slug}`.

**Why / where it fits:** This is W0.1 of `docs/milestones/M0-seed.md` §6 — the seed slice every other M0 brief
pattern-matches against (playbook §1 principle 5). W0.3, W0.4, W0.5 and W0.6 branch off *your* merged output, so
the seams you leave are the difference between a conflict-free fan-out and a bad week.

## Worktree and branch (work only here)

```
worktree: d:\pc-parts-inventory-wt\seed-workspace-api
branch:   feat/m0-seed-workspace-api   (already created from feat/m0-seed)
```
Never commit to `main` (it does not exist) or to `feat/m0-seed`. Commit early and often on your branch.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions, layout. The § Commands block describes what you are building; keep it true.
- `docs/milestones/M0-seed.md` — **the wave plan.** §1 D1–D15 are settled (do not re-litigate), §2 layout,
  **§3 data model (verbatim)**, **§4 contracts (verbatim)**, **§5 API surface**, §6 W0.1, §9 toolchain facts.
- `docs/adr/0001-stack.md` — why this stack; § Consequences constrains you.
- `~/.claude/playbook/multi-agent-playbook.md` §3 (escalation), §6 (gate order), §9 (report format).

## Recon (done by the PM on this machine, 2026-09-05 — do not re-derive)

### Toolchain — already verified, use exactly this
- Node **v22.14.0**, npm **10.9.2**, Docker **29.6.1**, Windows PowerShell **5.1.26100.9168** (no `pwsh`).
- **`corepack enable pnpm` FAILS on this box**: `EPERM … open 'D:\nodejs\pnpm'` — `D:\nodejs` is not writable by
  this user even outside the sandbox. **The PM already fixed it**: corepack shims were installed into
  `C:\Users\austi\bin` (which is on PATH) with
  `corepack enable --install-directory /c/Users/austi/bin pnpm`. **`pnpm` is on your PATH now — just use it.**
  `pnpm --version` → `11.25.0`. If a `pnpm` version is pinned in `package.json` that isn't cached, export
  `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` first (verified: it then downloads silently).
  Put the `corepack enable --install-directory …` recipe in your `CLAUDE.md` § Commands delta (report only).
- **pnpm 11 no longer reads the `pnpm` key in `package.json`** (it warns and ignores it). Settings such as
  `onlyBuiltDependencies` now live in **`pnpm-workspace.yaml`**. Verified.
- `pnpm install --frozen-lockfile` exits **0** even when it prints `[ERR_PNPM_IGNORED_BUILDS]`.

### Native modules — already smoke-tested by the PM in a scratch project, they work
- `better-sqlite3@13.0.3` ships **prebuilt binaries for every platform** (`prebuilds/win32-x64.node`,
  `linux-x64.node`, `linuxmusl-x64.node`, `darwin-*`) — **no node-gyp, no MSVC build tools needed**. Verified:
  open `:memory:`, create/insert/select works under Node 22.14 on Windows even with the install script ignored.
  Still list it under `onlyBuiltDependencies` in `pnpm-workspace.yaml` so the warning is gone and CI is honest.
- `@resvg/resvg-js@2.6.2` resolves a per-platform optional dep (`@resvg/resvg-js-win32-x64-msvc`) and renders:
  verified `new Resvg(svg).render().asPng()` → 83 bytes for a 20×10 red rect.

### Version pins — `npm view <pkg> version` run by the PM on 2026-09-05. **Verify each yourself, then pin exact.**
```
typescript 7.0.2(latest) 6.0.3 5.9.3   @types/node 26.4.1   vitest 5.0.0   @biomejs/biome 2.5.12
hono 4.13.7   @hono/zod-openapi 1.6.3   @hono/node-server 2.1.1   @scalar/hono-api-reference 0.12.0
zod 4.5.4   drizzle-orm 0.45.2   drizzle-kit 0.31.10   better-sqlite3 13.0.3   @types/better-sqlite3 9.6.0
nanoid 6.0.1   openapi-typescript 7.13.0   openapi-fetch 0.17.0   tsx 4.23.13
satori 0.33.4   @resvg/resvg-js 2.6.2
svelte 5.57.0   @sveltejs/kit 2.70.3   @sveltejs/adapter-node 5.5.7   @sveltejs/vite-plugin-svelte 7.3.0
vite 8.2.2   svelte-check 4.7.6
```
**The TypeScript trap (this is the one that will cost you an hour if you miss it):** `latest` is **7.0.2**, but the
declared peers are `svelte-check` → `typescript: ^5.0.0 || ^6.0.0`, `@sveltejs/kit` → `^5.3.3 || ^6.0.0`,
`openapi-typescript@7.13.0` → `^5.x`. **`typescript@5.9.3` is the only version that satisfies all three** and is
the version this stack's tooling is densest around. **Pin `typescript@5.9.3`.** If you have a concrete, tested
reason to go to `6.0.3`, you may — but then `openapi-typescript`'s peer is unsatisfied; record it and keep
`strict-peer-dependencies` off. **Do not pin TypeScript 7.**

Other peer facts already checked: `@hono/zod-openapi@1.6.3` → `zod ^4.0.0`, `hono >=4.10.0` (**so zod v4, import
`z` from `@hono/zod-openapi`, not from a v3 path**). `@sveltejs/vite-plugin-svelte@7.3.0` → `vite ^8`,
`svelte ^5.46.4`. `vitest@5.0.0` → `vite ^6.4||^7||^8`, `@types/node ^22||>=24`, engines `^22.12||^24||>=26`.
`@scalar/hono-api-reference@0.12.0` → `hono ^4.12.5`, engines `node >=22`. `nanoid@6.0.1` is **ESM-only**
(`"type": "module"`). All of these are consistent with the pin list above — the graph resolves.

### Known gotchas
1. **Svelte 5 runes** (`$state`, `$derived`, `$props`) — not Svelte 4 `export let` / `$:`. You do not write Svelte
   in this brief (that is W0.4), but the pins and the `CLAUDE.md` note are yours.
2. **zod v4** — `.openapi()` metadata comes from `@hono/zod-openapi`'s re-exported `z`. Mixing a bare `zod` import
   with the re-exported one silently loses OpenAPI metadata. Import `z` from `@hono/zod-openapi` in schema files
   that need `.openapi(...)`, and re-export one `z` from `packages/contracts` so nobody has both.
3. **ESM everywhere.** `"type": "module"` in every package; `NodeNext`/`Bundler` module resolution; `nanoid` and
   `satori` are ESM-only. `better-sqlite3` is CJS — import it as `import Database from 'better-sqlite3'`.
4. **Ephemeral ports are mandatory in the harness.** Three implementers will run `pnpm harness` in three worktrees
   at the same time. The harness must bind port **0** and read back the assigned port — never hard-code 3000.
   Same for the temp SQLite file: a fresh `os.tmpdir()` subdirectory per run, deleted at the end.
5. **`Default string` / `To Be Filled By O.E.M.` / `None` / `System Serial Number`** are real values the Windows
   scanner emits for missing serials (verified on this box: `Win32_BaseBoard.SerialNumber = "Default string"`).
   `normalizeScan` must treat them as `null`, and the ScanPayload schema must allow `serial: string | null`.
6. Windows path handling: use `node:path` and `pathToFileURL` for dynamic imports; a bare Windows path in
   `import()` throws `ERR_UNSUPPORTED_ESM_URL_SCHEME`.

## Contracts

Implement **§3 (data model)** and **§4 (contracts)** of `docs/milestones/M0-seed.md` **verbatim** — same table and
column names, same enum members, same DTO field names, the same `{ error: { code, message, details? } }` error
shape. Those are the wave's contracts; if one is wrong, **escalate, do not adjust**.

Beyond that, this brief defines three **seams** the parallel briefs depend on. They are load-bearing; get them
exactly right.

### Seam 1 — API route modules (pre-created and pre-mounted, so W0.3/W0.5 never edit a shared file)
`apps/api/src/app.ts` builds the `OpenAPIHono` app and mounts these modules, **all of which must exist and be
mounted at the end of this brief even where they are empty**:

```
apps/api/src/routes/health.ts     GET /health                                   (you implement)
apps/api/src/imports/routes.ts    POST /imports/scans, GET /imports/{id}        (you implement)
apps/api/src/builds/routes.ts     GET /builds, GET /builds/{id}                 (you implement)
apps/api/src/parts/routes.ts      GET /parts                                    (you implement)
apps/api/src/products/routes.ts   GET /products                                 (you implement; W0.3 adds the rest)
apps/api/src/share/routes.ts      GET /share/{slug}  (JSON only)                (you implement; W0.5 adds .md + card.png)
apps/api/src/pricing/routes.ts    EMPTY router, exported and mounted            (W0.3 fills it)
apps/api/src/jobs/routes.ts       EMPTY router, exported and mounted            (W0.3 fills it)
```
Each module exports `export const routes = new OpenAPIHono<Env>()` and registers its own routes on itself; the
empty ones export an empty router with a one-line comment naming the brief that fills them. `app.ts` mounts all
eight. **After this brief, no parallel brief needs to touch `app.ts`.**

### Seam 2 — harness check modules (so W0.3/W0.4/W0.5 each add one new file, never a shared one)
`tools/harness/harness.ts` is a runner. Every check is a module in `tools/harness/checks/*.ts`, **discovered by
reading the directory** (sorted by filename — prefix them `10-`, `20-`, … for order), so adding a check is adding
a file. Each module default-exports:

```ts
export type HarnessCtx = {
  apiUrl: string;                 // http://127.0.0.1:<ephemeral>
  webUrl?: string;                // set by the web check (W0.4) for later checks; undefined until then
  artifactsDir: string;           // artifacts/harness/<name>
  fixture: ScanPayload;           // the scan that was imported
  state: Record<string, unknown>; // cross-check scratch: importId, buildId, slug, productIds
  counters: Counters;             // mutate in place (see Seam 3)
  fail(msg: string): void;        // records an error and marks the run not-ok
};
export type HarnessCheck = { id: string; run(ctx: HarnessCtx): Promise<void> };
export default { id: '…', run: async (ctx) => { … } } satisfies HarnessCheck;
```
A check that throws is recorded as a failed check and the run exits non-zero. `--name <n>` sets the artifacts
directory. The runner boots the API in-process (or as a child process) on an ephemeral port against a temp DB,
runs migrations, runs the checks in order, then writes `report.json` and exits `0`/`1`.

### Seam 3 — `artifacts/harness/<name>/report.json` (the integration gate reads these exact keys)
Write **all** of these keys every run. Keys this brief cannot fill yet get their stated zero value, not `undefined`
— later briefs fill them in and the PM's §7 gate asserts on them.

```jsonc
{
  "name": "w01",
  "ok": true,
  "startedAt": "2026-09-05T…Z",
  "durationMs": 0,
  "counters": {
    "importsIdempotent": false,          // W0.1: true after the second POST returns 200 and creates nothing
    "productsCreated": 0,                // W0.1
    "productsUpdated": 0,                // W0.1
    "partsCreated": 0,                   // W0.1
    "partsUpdated": 0,                   // W0.1
    "partsShelved": 0,                   // W0.1
    "buildsCreated": 0,                  // W0.1
    "quotesRecorded": 0,                 // W0.3
    "valuation": { "acquiredCents": 0, "currentCents": 0, "deltaCents": 0 },   // W0.3
    "share": {
      "json": { "items": 0 },            // W0.1
      "html": { "ogTags": 0, "bytes": 0 },   // W0.4
      "md":   { "rows": 0, "bytes": 0 }      // W0.5
    },
    "card": { "bytes": 0 }               // W0.5
  },
  "checks": [ { "id": "import-scan", "ok": true, "ms": 0, "detail": "…" } ],
  "errors": []
}
```

### Seam 4 — root scripts must not need editing when a package is added
Root `package.json` scripts use recursive, tolerant invocation so W0.4 can add `apps/web` **without touching a
root file**:
```
build      pnpm -r --if-present build
typecheck  pnpm -r --if-present typecheck        # each package's own typecheck; web's runs svelte-check (W0.4)
lint       biome check .
test       pnpm -r --if-present test
gen        pnpm --filter @pcpi/contracts gen
harness    tsx tools/harness/harness.ts
dev        pnpm -r --parallel --if-present dev
```
`pnpm-workspace.yaml` uses globs `apps/*`, `packages/*`, `tools/*` for the same reason.

## Scope

**May edit / create (everything below is new):**
- root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc`, `tsconfig.base.json`, `tsconfig.json`,
  `biome.json`, `.nvmrc`, `.gitignore` (append only), `vitest.workspace.ts` if you want one
- `packages/contracts/**` — including `fixtures/scan.sample.json`, `scripts/gen.ts`, `scripts/validate.ts`
- `packages/core/**` — including `src/pricing/index.ts` (the §4 `PricingProvider` interface + `QuoteKind`, types
  only; **no providers** — those are W0.3)
- `apps/api/**`
- `tools/harness/**`
- `docs/process/briefs/2026-09-05-m0-seed-workspace-api.md` — **read-only**, do not edit your own brief

**Read-only:** everything else. Specifically **do not create `apps/web/`, `tools/scanner/`, `docker/`,
`compose.yaml`, `.github/`** — those belong to W0.4, W0.2 and W0.6 and creating stubs there causes merge conflicts.
**Shared docs (`CLAUDE.md`, `README.md`, ADRs, `docs/milestones/**`) are PM-owned during fan-out** — put your
`CLAUDE.md` § Framework notes and § Commands lines in your report's `Follow-ups`, verbatim and ready to paste.

## Deliverables (the detail behind §6 W0.1)

1. **Workspace.** pnpm workspace, `"type": "module"` everywhere, TS **strict** (`strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noImplicitOverride`) in `tsconfig.base.json`, project references so `tsc -b` works.
   `.nvmrc` = `22.14.0`; root `engines.node` = `>=22.14`. `packageManager: "pnpm@11.25.0"`. Biome for lint **and**
   format, one `biome.json` at the root. Package names `@pcpi/contracts`, `@pcpi/core`, `@pcpi/api`, `@pcpi/harness`.
2. **`packages/contracts`.** §4 zod schemas: `ScanComponent`, `ScanPayload`, the category enum from §3, every DTO in
   §4 (`Owner`, `Product`, `Part`, `Build`, `BuildItem`, `ProviderLink`, `PriceQuote`, `Import`, `Valuation`,
   `SharedBuild`), and `ApiError`. One exported `z`. Scripts:
   - `gen` → boots the API's OpenAPI document generator and writes `packages/contracts/openapi.json`, then runs
     `openapi-typescript` over it to `packages/contracts/generated/client.d.ts`. **Both outputs are committed.**
   - `validate` → `tsx scripts/validate.ts <file.json> [--schema ScanPayload]`: parses the JSON, validates it
     against the named schema (default `ScanPayload`), prints a one-line summary
     (`OK ScanPayload <file>: 7 components, categories: cpu,gpu,memory(2),storage,motherboard`) and exits 0, or
     prints the zod issues and exits 1. **This script is used by W0.2's acceptance and by the PM at integration —
     it must work against an arbitrary path, including one outside the package.**
3. **`packages/core`** — pure, no I/O, no DB, no fetch:
   - `normalizeScan(payload: ScanPayload) → { products: NormalizedProduct[], parts: NormalizedPart[], identityKeys: string[] }`
     implementing **D8**: identity key = `serial` when present and not a placeholder (see Recon gotcha 5), else
     `${category}|${manufacturer}|${model}|${slot ?? ''}`; product identity = `(category, manufacturer, model, partNumber?)`.
     Two identical sticks with different serials ⇒ **1 product, 2 parts**.
   - `valuate(input) → Valuation` implementing **D5**: latest quote per product, kind precedence
     `used_market > new_retail > msrp` (`manual` beats all — state your choice in a comment and a test),
     `ageDays` from `observedAt`, `deltaCents = currentCents - acquiredCents`, `deltaPct` rounded to 1 decimal,
     integer minor units only (**D6** — no floats anywhere in the money path).
   - `src/pricing/index.ts`: the §4 `PricingProvider` interface, `QuoteKind`, and the identity type. Types only.
   - Unit tests (vitest) against `packages/contracts/fixtures/scan.sample.json`, hand-written to the ScanPayload
     contract with **≥ 6 components including two identical memory sticks with different serials and one storage
     device with a serial**. Model it on the shape of a real machine (see W0.2's brief for the real MOONPC values
     if you want realistic strings). **State the expected counts as constants in the test** so the harness and the
     test agree.
4. **`apps/api`.** Hono + `@hono/zod-openapi`; OpenAPI 3.1 at `/api/openapi.json`, Scalar at `/api/docs`; all
   routes under `/api/v1`. Drizzle schema from §3 (one schema file, sqlite dialect now; keep dialect-specific
   code isolated so postgres is additive), `drizzle-kit` migration checked in, **migrations run on boot**, owner
   `local` seeded idempotently on boot. Endpoints for this brief: `GET /health`
   (`{ ok, version, db: 'sqlite' }`), `POST /imports/scans`, `GET /imports/{id}`, `GET /builds`, `GET /builds/{id}`,
   `GET /parts`, `GET /products`, `GET /share/{slug}` (JSON). `API_TOKEN` middleware per **D3** (set ⇒ mutating
   routes need `Authorization: Bearer`; unset ⇒ open; share routes always public). `DATABASE_URL` (`file:…`) and
   `PORT` from env. Every non-2xx returns the §4 error shape via one `onError`/`notFound` handler.
   Scan import per **D8**: idempotent on `payloadHash` (**second identical POST ⇒ 200, no new rows**), one build
   per `hostname` auto-created with `source='scan'` and a 10-char lowercase base32 slug (**D7**), components
   missing from a later scan ⇒ `status='on_shelf'` (never deleted), `Import.summary` populated with the six
   counters in §4. Share JSON must **omit serials, notes, acquiredSource and owner data** and 404 for `private`.
   API integration tests with vitest (supertest-style via `app.request()`, no network).
5. **`tools/harness/harness.ts`** per Seam 2/3, with checks covering: migrate+seed, `GET /health`, POST the sample
   scan, POST it again (assert 200 + idempotent), `GET /imports/{id}`, `GET /builds`, `GET /builds/{id}`,
   `GET /share/{slug}` (assert every sample item's model string is present, assert no serial leaks). Assert the
   counters the sample implies and **state those numbers in the check's `detail`**.

## Acceptance (named, runnable — run these from the worktree root and paste the tails)
- [ ] `pnpm install --frozen-lockfile` → exit 0 (run a plain `pnpm install` first to create the lockfile; commit it)
- [ ] `pnpm build` green
- [ ] `pnpm typecheck` green (`tsc -b`, 0 errors)
- [ ] `pnpm lint` green (`biome check .`, 0 errors — formatting included)
- [ ] `pnpm test` green; name the core tests that prove **D8** (2 sticks → 1 product / 2 parts) and **D5**
      (kind precedence + `ageDays`)
- [ ] `pnpm gen` regenerates `openapi.json` + `generated/client.d.ts` with **no diff** on a second run (idempotent);
      both files committed
- [ ] `pnpm --filter @pcpi/contracts validate packages/contracts/fixtures/scan.sample.json` → exit 0, quote the line
- [ ] `pnpm harness --name w01` → exit 0; **quote every counter** from `artifacts/harness/w01/report.json`
      (`importsIdempotent`, `productsCreated`, `partsCreated`, `buildsCreated`, `share.json.items`) and say what
      the sample fixture implies they should be
- [ ] Two harness runs back to back both green (proves the temp DB / ephemeral port isolation works)

## Non-goals (do these **not**)
- No pricing providers, no jobs table runner, no `/valuation`, no `/refresh`, no links endpoints — **W0.3**.
  (The `jobs` **table** is part of §3 and *is* yours; the runner is not.)
- No `apps/web`, no SvelteKit, no share HTML — **W0.4**.
- No Markdown or PNG share exports, no satori/resvg wiring, no fonts — **W0.5**. Do not add those dependencies.
- No Dockerfiles, no `compose.yaml`, no GitHub Actions — **W0.6**.
- No `tools/scanner/` — **W0.2** owns it and is running in parallel right now.
- No auth UI, no multi-owner logic beyond the `ownerId` column and the seeded `local` owner.
- No Postgres driver wiring. Keep the schema dialect-portable; do not add `postgres`/`pg`.

## When to ask for help (escalation — one rung up only: the **PM (Opus)**)
Escalate — `STATUS: ESCALATE`, playbook §3 message format, then stop — when any of these is true: two failed
attempts at the same sub-goal; the §3/§4 contract as written cannot be implemented as specified; a version pin
resolves into an unsatisfiable graph; a test can only go green by weakening it; a toolchain failure survives one
retry; you need to touch a file outside Scope. **Do not invent a contract change.** You will be resumed with an
answer, context intact.

## Done definition
Report in the playbook §9 format: `STATUS`, `Changed`, `Verified` (one block per gate, with the real output tail —
a gate without a tail is rejected on sight), `Evidence` (`artifacts/harness/w01/report.json` with the counters
quoted), `Open issues` (none for DONE), `Escalations`, `Follow-ups`. **`Follow-ups` must contain the exact
`CLAUDE.md` § Framework notes lines** — the pinned versions of Svelte, Drizzle, zod and Hono with the one gotcha
each that matters to LLM-written code — plus any § Commands correction (e.g. the corepack shim recipe). Gate tails
go in the final commit message. No TODOs in code. Work only on `feat/m0-seed-workspace-api`.
