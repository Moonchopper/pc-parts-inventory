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

## Framework notes (the seed brief fills these in with the pinned versions and the gotchas that matter to LLM-written code)

- Svelte 5 runes (`$state`, `$derived`, `$props`) — not Svelte 4 `export let` / `$:` syntax.
- Drizzle: <pinned version> — <migration command; sqlite driver used; dialect-specific notes>
- zod: <pinned version> — <v3 or v4; import path used by `@hono/zod-openapi`>
- Hono: <pinned version> — <OpenAPI registry pattern; error handler>
