# ADR-0001 — Stack and API-first architecture

**Status:** **Accepted 2026-09-05** — Austin picked the TypeScript row after R12/R13 were added.
**Owner:** Austin. **Author:** Fable (architect).

## Context

Austin's direction at intake (2026-09-05): *API-driven is a must for extensibility; containerization is the
preferred deployment; do not let prior projects' stacks bias the pick; unfamiliar technology is acceptable if
it is right for this app.* The requirements below are derived from [`docs/vision/intake.md`](../vision/intake.md)
and that direction — not from any existing codebase.

### Requirements the stack must serve

| # | Requirement | Where it comes from |
|---|---|---|
| R1 | **API-first.** A typed HTTP API with a generated OpenAPI 3.1 spec and generated clients. The web UI is one client; the PowerShell scanner and any future script/plugin are others. | Austin: "API-driven is a must" |
| R2 | **Container-native.** Small image, sub-second start, 12-factor config, health endpoints, `docker compose up` locally, Helm-able later. | Austin: "containerization preferred" |
| R3 | **SQLite now → Postgres later** through one schema definition and one migration tool. Append-only `price_history`; `owner_id` on every root row. | Pillar 4 |
| R4 | **Background jobs without Redis.** Scheduled price refresh and import processing must run on SQLite; upgrade to a Postgres-backed queue without a rewrite. | Pillar 2, R3 |
| R5 | **Importers.** CSV/JSON/HTML parsing of order exports, retailer/price HTTP APIs, UPC lookup, pluggable pricing providers. | Pillar 1, 2 |
| R6 | **Share page.** SSR HTML that reads without JS, OG meta for Discord/Reddit unfurl, plus Markdown/PNG/JSON exports. PNG must not require a headless browser in the container. | Pillar 3 |
| R7 | **Interactive UI.** Build editor, inventory tables, browser-camera barcode capture. | Pillar 1, 3 |
| R8 | **Extensibility.** Provider/importer plugin seams, webhooks later, multi-tenant + auth seam later. | Goal 4 |
| R9 | **Agent-authored codebase.** Sonnet writes most code and Opus validates it: the stack must make wrong code fail *early and loudly* (static types, compile/typecheck, fast tests) and be one LLMs write reliably. | Playbook §2 |
| R10 | **Deterministic harness.** Fixture DB, recorded HTTP for providers, headless run that writes `report.json` + PNG evidence. | Playbook §6 |
| R11 | **Longevity.** Boring, maintained parts; a personal tool that may become a product. | Goal 4 |
| R12 | **Cross-platform.** Develop and run natively on Windows, macOS and Linux (x64 + arm64); containers identical on all three. | Austin, 2026-09-05 |
| R13 | **Mobile-friendly.** A phone client (PWA first, native later) with barcode/photo capture, generated from the same API; code reuse between web and mobile is a plus, not a must. | Austin, 2026-09-05 |

### Architecture decision independent of language

**The API is the product; the web UI is a client of it.** The web layer never touches the database — it calls the
API through the generated client. This is the only arrangement that *proves* R1 rather than asserting it: if the
UI can be rebuilt from the OpenAPI spec alone, so can anyone's integration. Deployment is two containers
(`api`, `web`) behind one compose file, with a Postgres profile; the SQLite file lives on a volume.

## Options considered

Scored 1–5 against the requirements. Scores are the architect's judgment as of 2026-09-05; the M0 seed exists to
retire toolchain risk on whichever row is chosen (playbook §4 phase 2).

| Stack (API · DB · web) | R1 API/OpenAPI | R2 Container | R3 SQLite→PG | R4 Jobs, no Redis | R5 Importers | R6 Share SSR+OG+PNG | R7 UI | R9 Agent safety + loop | R11 Stability | One language API+web | R12 X-platform | R13 Mobile | **Σ** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **TypeScript** · Hono + zod-openapi · Drizzle · SvelteKit | 5 | 3 | 5 | 4 | 5 | 5 | 5 | 4 | 3 | 5 | 5 | 5 | **54** |
| **.NET** API · EF Core · **SvelteKit** web | 4 | 4 | 5 | 5 | 4 | 5 | 5 | 4 | 4 | 2 | 5 | 4 | 51 |
| **.NET** · minimal API + OpenAPI · EF Core · Razor/HTMX | 4 | 4 | 5 | 5 | 4 | 3 | 3 | 5 | 5 | 4 | 5 | 3 | 50 |
| **Python** FastAPI · SQLAlchemy · **SvelteKit** web | 5 | 3 | 4 | 4 | 5 | 5 | 5 | 3 | 4 | 2 | 4 | 4 | 48 |
| **Go** API · Huma · **SvelteKit** web | 4 | 4 | 3 | 4 | 4 | 5 | 5 | 4 | 4 | 2 | 4 | 4 | 47 |
| **Go** · Huma · sqlc/ent · templ + HTMX | 4 | 5 | 3 | 4 | 4 | 3 | 3 | 5 | 5 | 4 | 4 | 2 | 46 |
| **Kotlin/Java** Spring Boot · JPA (KMP shares models with mobile) | 4 | 2 | 5 | 4 | 4 | 3 | 3 | 4 | 5 | 3 | 5 | 4 | 46 |
| **Python** FastAPI · SQLAlchemy · Jinja + HTMX | 5 | 3 | 4 | 4 | 5 | 3 | 3 | 3 | 4 | 4 | 4 | 2 | 44 |
| **Elixir** Phoenix · Ecto · LiveView · Oban | 3 | 4 | 4 | 5 | 3 | 4 | 4 | 3 | 4 | 4 | 3 | 3 | 44 |
| **Ruby** Rails 8 API + Hotwire · Solid Queue (Hotwire Native) | 3 | 3 | 4 | 5 | 4 | 4 | 4 | 2 | 4 | 4 | 3 | 4 | 44 |
| **Rust** axum + utoipa · sqlx · askama + HTMX | 3 | 5 | 3 | 3 | 3 | 3 | 3 | 2 | 4 | 3 | 4 | 2 | 38 |

### Why the cells say what they say (the ones that decide it)

- **R1.** FastAPI and Hono's zod-openapi are schema-first by construction — the spec falls out of the types and a
  typed client falls out of the spec. .NET and Go (Huma) generate good specs from annotated types. Rails, Phoenix,
  Rust need a second tool and discipline to keep the spec honest.
- **R2.** Go and Rust ship 10–20 MB distroless images with millisecond starts. .NET chiseled images are ~50 MB.
  Node on distroless is ~120 MB with ~300 ms start — acceptable for "preferred deployment", not exceptional.
  JVM images and start-up are the outlier.
- **R3.** Drizzle and EF Core define the schema once and emit migrations for both SQLite and Postgres. Go's
  sqlc is per-dialect SQL (two query sets) unless an ORM (ent/bun) is adopted; sqlx has the same shape.
- **R4.** Everything can run an in-process scheduler over a `jobs` table on SQLite. .NET hosted services, Oban,
  Solid Queue and Quartz are the most mature "no Redis" stories; Node needs a small in-house runner until
  Postgres (then pg-boss).
- **R6.** PNG without a browser: satori (HTML/CSS → SVG) + resvg — the pipeline Vercel uses for OG images — is
  native to the TypeScript row. Every other row rasterizes SVG (fine) but writes the card as SVG by hand.
  SvelteKit/Next SSR with OG tags is the strongest share-page story; Razor, templ, Jinja all *can* do it with
  more hand-rolled work. LiveView is excellent for interactivity, unnecessary for a read-only share page.
- **R9.** C# and Go fail loudest and earliest: no `any`, no optional typing, precise compile errors, fast tests.
  TypeScript strict + zod at every boundary is close; its known failure mode under LLM authorship is
  framework-version drift (Svelte 4 vs 5 syntax, Drizzle API changes) — mitigated by pinning exact versions and
  writing the version notes into `CLAUDE.md`. Python's optional typing lets agent mistakes reach runtime.
  Rust's iteration cost (borrow-checker rounds, compile time) turns Sonnet's normal mistakes into escalations.
- **R12.** Containers equalize every row on Docker Desktop / OrbStack / Podman (Windows note for all: SQLite on a WSL2
  bind mount is slow and lock-prone — compose uses a named volume). Natively: Node, .NET and the JVM are first-class
  on all three OSes and both architectures (Node's native modules — `better-sqlite3`, `resvg-js` — ship prebuilt
  binaries, and `node:sqlite` removes the dependency); Go cross-compiles trivially *if* the pure-Go SQLite driver is
  used (the cgo one needs gcc on Windows); Python is fine with `uv`; Rust needs MSVC tools on Windows; Elixir and
  Ruby are weakest on Windows (NIF / native gem builds). The **scanner** is OS-specific by nature in every row
  (CIM on Windows, `system_profiler` on macOS, `lshw`/`dmidecode` on Linux) — see Consequences.
- **R13.** API-first means every row supports a native app via a generated Swift/Kotlin client. The PWA path
  (installable web app; barcode and photo capture through the browser camera API) is the v1 mobile client and is
  strongest where the web layer is SvelteKit. TypeScript is the only row where a native wrapper (Capacitor) reuses
  the web UI *and* the contracts package; .NET's MAUI shares models and the client; Rails' Hotwire Native and
  Kotlin Multiplatform are real stories; Go/Python/Rust/Elixir share nothing with a mobile client. Mobile-required
  API traits (token auth, pagination, ETag/delta sync, idempotent uploads, push seam) are stack-independent and go
  into the seed's contracts regardless of row.
- **One language.** The web and the API sharing one schema package (zod) removes an entire class of contract
  drift the PM would otherwise have to catch by hand, and halves the toolchains, test runners, lint configs and
  brief styles. The two-language rows pay for their best-of-both UI with exactly that coordination cost.

## Recommendation

**TypeScript, API-first, two containers.**

| Part | Candidate (confirmed by the M0 seed, not by this ADR) | Role |
|---|---|---|
| Runtime | Node 24 LTS on a distroless image (Bun is a later drop-in if wanted) | R2 |
| API | **Hono** + `@hono/zod-openapi` → OpenAPI 3.1 at `/api/openapi.json`, Scalar docs at `/api/docs` | R1 |
| Contracts | `packages/contracts`: zod domain + request/response schemas; generated spec + `openapi-fetch` client | R1, R9 |
| DB | **Drizzle** — `better-sqlite3` now, `postgres-js` later; one schema, `drizzle-kit` migrations | R3 |
| Jobs | In-process runner over a `jobs` table (SQLite-safe); `pg-boss` when on Postgres | R4 |
| Web | **SvelteKit** (SSR, form actions) calling the API via the generated client; OG tags; `html5-qrcode` for barcode | R6, R7 |
| PNG export | `satori` + `@resvg/resvg-js` in the API: `GET /api/v1/builds/{slug}/card.png` | R6 |
| Scanner | `tools/scanner/scan.ps1` — Windows CIM → JSON → `POST /api/v1/imports/scans` (or file upload) | Pillar 1 |
| Tests / gates | `vitest`; `tsc --noEmit`; Biome (lint+format); `pnpm harness` = fixture DB + fixture scan + fixture order CSV + stubbed provider → asserts counters, fetches the share page + PNG, writes `artifacts/harness/<name>/` | R9, R10 |
| Layout | pnpm workspace: `apps/api`, `apps/web`, `packages/contracts`, `packages/core` (pure domain: pricing math, importers' parsers), `tools/scanner` | R8 |

R12/R13 (added at Austin's request, 2026-09-05) widen the gap rather than close it: mobile is where
one-language-plus-web-as-client pays off most.

**Runner-up: .NET API + SvelteKit web** — C#'s stricter typing and a ~50 MB chiseled image; two languages, with the
contracts package becoming TS generated from the OpenAPI spec. **Third: Go API (Huma + ent) + SvelteKit web.** Choose Go if a 15 MB image and a zero-churn standard library matter more than one-language contracts. Austin's
fluency with .NET is deliberately not weighed by this ADR.

**Revisit trigger (M0 retro):** if Sonnet's web briefs average more than one PM send-back for framework-version
drift, replace SvelteKit with Hono JSX + HTMX (still TypeScript, still one contracts package) *before* touching the API.

## Consequences

- The API is versioned from day one (`/api/v1`), and every UI feature is first an API feature — briefs for the
  web cannot land before the endpoint they consume.
- Two deployables locally (`docker compose up` brings up `api`, `web`, and a volume); hosting adds a Postgres
  service and nothing else.
- Exact version pins and a "framework notes" block in `CLAUDE.md` are part of the M0 seed's deliverable.
- The PowerShell scanner stays dependency-free so it runs on any Windows box; it talks to the API, not the DB.
- The scanner is its own small tool with one JSON contract. M0 ships `tools/scanner/scan.ps1` (Windows CIM, zero
  dependencies — Austin's machines). M1 decides, with evidence, between per-OS scripts (PowerShell / `system_profiler`
  / `lshw`) and one zero-dependency static binary (Go + `ghw`, or Node SEA + `systeminformation`) for all three OSes.
- Mobile v1 is the web app installed as a PWA (manifest + service worker + camera capture) — an M2 work item, no new
  stack. A native wrapper (Capacitor) is a later ADR and reuses the web UI and contracts as-is.
- Multi-tenancy and auth are a later ADR; the seed carries `owner_id` and an auth middleware seam so they are
  additive.
