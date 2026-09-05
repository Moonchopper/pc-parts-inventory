# PC Parts Inventory — agent guide

Self-hosted inventory of owned PC hardware with automated capture (hardware scan, order-history import,
barcode), **paid-vs-now** pricing with a history we own, and builds that are shareable as a URL and as exports.
Local-first (SQLite, two containers), designed to become hosted. **Stack (ADR-0001, accepted 2026-09-05):
TypeScript everywhere — Hono + zod-openapi API, Drizzle (SQLite → Postgres), SvelteKit web as a pure API client,
satori + resvg for PNG cards, vitest + Biome, pnpm workspace, Node 22 LTS.** The API is the product; the web never
touches the DB.
Read in this order when starting a task: this file → the brief you were given → the docs it links.
**Research before you edit:** read a file before editing it; grep for all callers before changing a function.

- Intake / pillars / milestones: [`docs/vision/intake.md`](docs/vision/intake.md)
- How we work (roles, escalation ladder, briefs, gates): `~/.claude/playbook/multi-agent-playbook.md` (global).
  Roles: **Fable = architect/lead (the session)**, **Opus = PM/PO** (`pm` agent: briefs + validation + in-wave
  integration), **Sonnet = implementer**. Agents: `~/.claude/agents/{pm,implementer,architect,debugger,qa}.md`.
- Decisions: [`docs/adr/`](docs/adr/) — **0001 stack + API-first** (accepted)
- Milestones / wave plans: [`docs/milestones/`](docs/milestones/) — **M0 Seed** (current — `M0-seed.md`: settled
  decisions D1–D15, data model, contracts, API surface, work items W0.1–W0.6), M1 Capture + delta, M2 Share
- Briefs: [`docs/process/briefs/`](docs/process/briefs/) · Test guides: [`docs/process/test-guides/`](docs/process/test-guides/) ·
  Retro log: [`docs/process/retro-log.md`](docs/process/retro-log.md)

## Commands (run from the repo/worktree root — the M0 seed creates them; keep this block true)

```bash
# pnpm bootstrap on Austin's box: `corepack enable pnpm` FAILS (EPERM — D:\nodejs is not user-writable).
# Use a writable dir on the PERSISTENT user PATH (PowerShell + Git Bash):  corepack enable --install-directory C:\Users\austi\.local\bin pnpm
# CI runners are fine with plain `corepack enable` / pnpm/action-setup.
pnpm install --frozen-lockfile
pnpm build                       # all workspaces
pnpm typecheck                   # tsc -b + svelte-check
pnpm lint                        # biome check
pnpm test                        # vitest (core, contracts, api, web)
pnpm harness --name <n>          # boots the API on a temp SQLite DB with HARNESS=1 + fixture provider, imports the scan fixture,
                                 # runs due jobs, fetches share JSON/HTML/MD/PNG → artifacts/harness/<n>/{report.json,card.png,share.html}
                                 # READ report.json (counters) and card.png before claiming anything works
pnpm gen                         # contracts → openapi.json + generated client types (commit the output)
pnpm dev                         # api :3000 (Scalar docs at /api/docs) + web :5173
                                 # FOOTGUN: VS Code can squat 127.0.0.1:3000 — Node then binds with NO error
                                 # and every request hangs. `netstat -ano | findstr :3000` before blaming the API.
docker compose up --build        # api + web containers, named volume pcpi-data
powershell -NoProfile -File tools/scanner/scan.ps1 -OutFile scan.json [-ApiUrl http://localhost:3000 -Token …] [-RedactSerials]   # Windows PowerShell 5.1 (pwsh 7 also works if present)
```

## Layout (target — `docs/milestones/M0-seed.md` §2 is the source of truth)

```
apps/api            Hono + zod-openapi; Drizzle schema/migrations; job runner; share exports
apps/web            SvelteKit (SSR, adapter-node); generated API client; /b/{slug} share page; inventory + build pages
packages/contracts  zod schemas (domain, ScanPayload, DTOs); gen → openapi.json + client types
packages/core       pure domain: scan normalization, valuation, PricingProvider + fixture provider
tools/scanner       scan.ps1 + fixtures/*.redacted.json (real machines, serials hashed)
tools/harness       harness.ts
docker/, compose.yaml, .github/workflows/ci.yml
artifacts/          gitignored evidence
```

## Conventions

- Branches only — never commit to `main`. `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
  `main` is born from the merge of `feat/bootstrap`. Wave branches: `feat/m0-seed`; brief branches `feat/m0-<slug>`
  in worktrees under `d:\pc-parts-inventory-wt\<slug>`.
- Gate order: build → typecheck → lint → test → harness → (docker) → manual test guide (playbook §6). Show output,
  don't claim. Every harness evidence row quotes the counters from `report.json`.
- Gate tails go in the final commit message of every brief.
- No new dependencies without the brief saying so; **exact version pins** (no `^`/`~`).
- `ownerId` on every root table; money is integer minor units + ISO-4217 currency; `price_quotes` is append-only.
- Share responses never include serials, notes, acquired source or owner data.
- `apps/web` imports only from `packages/contracts` and its generated client — never Drizzle, never `apps/api`.
- Real hardware is the evidence: the harness fixture is a redacted scan of one of Austin's machines.
- **Delete responses** return `{ deleted: true }` (the resource itself) or `{ removed: true }` (a link/
  membership row such as a build item) — never a bare 204, so a client can tell the two apart.
- **`identityKey` for a manually created part** (no scan behind it) is its `serial` when present, else
  `part:<id>` — never a `(category, manufacturer, model, slot)` tuple, which is D8's *scan* key and would
  collide with a later scan of the same hardware.
- **Valuation totals cover different item sets by design (D5):** `acquiredCents` spans items with a cost
  basis, `currentCents` spans items with a quote, and the only place `current − acquired` is meaningful is
  inside `comparable`. Never render a delta computed from the two top-level totals.
- **Harness checks are files** in `tools/harness/checks/`, discovered by directory read and run in
  **filename order** — the numeric prefixes are load-bearing. Adding a check means adding a file, never
  editing `harness.ts`.

## Framework notes (pinned by the M0 seed; **exact pins, no `^`/`~` anywhere** — verified by the PM 2026-09-05)

- **TypeScript: 5.9.3 — do not bump.** `latest` is 7.0.2, but `svelte-check` wants `^5||^6`,
  `@sveltejs/kit` `^5.3.3||^6`, and `openapi-typescript` `^5.x`. 5.9.3 is the only version satisfying all three.
- **zod: 4.5.4 (v4).** `@hono/zod-openapi` re-exports a `z` decorated with `.openapi()`. Importing bare `zod`
  alongside it silently drops the OpenAPI metadata — so there is exactly **one** `z`, re-exported from
  `packages/contracts/src/z.ts`. Import it from there, never from `zod`.
- **Hono: 4.13.7** + `@hono/zod-openapi` 1.6.3 + `@hono/node-server` 2.1.1 + `@scalar/hono-api-reference` 0.12.0.
  Each route module owns its own `OpenAPIHono` router and registers its own routes; `apps/api/src/app.ts` mounts
  all eight and is the only place that changes when a *new* module appears. One `onError` + one `notFound`
  produce the `{ error: { code, message, details? } }` shape. Spec is emitted with `app.doc31()`.
- **Drizzle: `drizzle-orm` 0.45.2 / `drizzle-kit` 0.31.10**, `better-sqlite3` 13.0.3 driver. Migrations:
  `pnpm --filter @pcpi/api db:generate` (writes `apps/api/drizzle/`), applied on API boot. One schema file
  (`apps/api/src/db/schema.ts`), sqlite dialect now, postgres later. In SQLite a plain unique index already
  means "unique among non-NULL rows", so §3's `partNumber`/`upc` rules need no partial index.
- **Svelte 5 runes** (`$state`, `$derived`, `$props`, `{@render}`) — **not** Svelte 4 `export let` / `$:` /
  `<slot>`. Pins: svelte 5.57.0, `@sveltejs/kit` 2.70.3, adapter-node 5.5.7, vite-plugin-svelte 7.3.0 (requires
  vite `^8` and svelte `^5.46.4`), vite 8.2.2, svelte-check 4.7.6.
- **pnpm 11 settings live in `pnpm-workspace.yaml`**, not the `pnpm` key of `package.json` (silently ignored).
  `allowBuilds`/`onlyBuiltDependencies` list `better-sqlite3`. That package also ships prebuilds for
  win32/linux/linuxmusl x64+arm64, so no compiler is needed to *run* it — relevant to the container image.
- **PNG cards: `satori` 0.33.4 + `@resvg/resvg-js` 2.6.2 + `@fontsource/inter` 5.3.0**, in `apps/api` (added by
  W0.5 — the seed deliberately did not). satori takes a **plain object tree, no JSX**, supports only a small CSS
  subset (every multi-child element needs an explicit `display: flex`), and accepts **ttf/otf/woff but not woff2**
  — the two `.woff` faces plus `OFL.txt` are committed under `apps/api/assets/` and loaded once at module scope.
- **`better-sqlite3` is CJS** (`import Database from 'better-sqlite3'`); `nanoid` and `satori` are ESM-only.
  Everything here is `"type": "module"`.
- **The harness must never hard-code a port or DB path** — it binds `PORT=0`, reads the port the child reports
  on stdout, and uses a fresh `os.tmpdir()` database, because several worktrees run it concurrently.
