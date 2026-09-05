# Brief: m0-containers-and-ci  (2026-09-05, tier: sonnet, author: pm, wave: M0 Seed / W0.6)

**Goal (one sentence):** `docker compose up --build` serves the share page from two containers with the SQLite
file on a named volume, and a GitHub Actions matrix (ubuntu + windows) runs every gate including the harness and
uploads the evidence.

**Why / where it fits:** W0.6 of `docs/milestones/M0-seed.md` §6 — the last brief of the wave, run after W0.3,
W0.4 and W0.5 are merged into `feat/m0-seed`. **D13** (two containers, named volume, `node:22-slim`/distroless),
**D14** (CI on ubuntu + windows; *the first green CI is part of M0's done-definition*), ADR-0001 **R2/R12**.

## Worktree and branch (work only here)

```
worktree: d:\pc-parts-inventory-wt\containers-and-ci
branch:   feat/m0-containers-and-ci   (created from feat/m0-seed AFTER W0.3/W0.4/W0.5 merged — the full slice is present)
```
Run `pnpm install` in the worktree first. Never commit to `main` (it does not exist) or to `feat/m0-seed`.
**Never push, never open a PR** — the PM merges locally and the architect handles anything outward-facing.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — the § Commands block is the list of gates CI must run, in order; § Framework notes has the pins.
- `docs/milestones/M0-seed.md` — **D13, D14**, §2 layout, §6 W0.6, §7 (the integration gate the PM runs after you),
  §9 toolchain facts.
- `docs/adr/0001-stack.md` — R2 (container-native, 12-factor, health endpoints), R12 (cross-platform, and the
  **WSL2 SQLite bind-mount warning** — that is why D13 says *named volume, never a bind mount*).
- The merged slice: root `package.json` + `pnpm-workspace.yaml` (the scripts and globs), `apps/api/src/index.ts`
  (how the server starts, which env vars it reads), `apps/web/svelte.config.js` + its adapter-node build output,
  `tools/harness/harness.ts` (what the harness needs at run time).
- `~/.claude/playbook/multi-agent-playbook.md` §3, §6, §9.

## Recon (by the PM)

### Toolchain facts, verified on this machine 2026-09-05
- Docker **29.6.1**. Node **22.14.0**, npm 10.9.2, **Windows PowerShell 5.1 only** (no `pwsh`) — any script you
  add for Windows CI must be `shell: pwsh`-free unless you are sure the runner has it (GitHub's
  `windows-latest` *does* ship pwsh 7; **Austin's box does not** — so keep repo scripts 5.1-compatible).
- **`corepack enable pnpm` fails on Austin's box** (`EPERM … D:\nodejs`, not writable). The working recipe is
  `corepack enable --install-directory <a writable dir on PATH> pnpm`. **On CI runners `corepack enable pnpm`
  works fine** — use `pnpm/action-setup@v4` (pins from `packageManager` in `package.json`) or
  `corepack enable`, and note the local difference in your README/CI comment.
- `pnpm install --frozen-lockfile` exits **0** even while printing `[ERR_PNPM_IGNORED_BUILDS]`; the root
  `pnpm-workspace.yaml` lists `onlyBuiltDependencies` (pnpm 11 no longer reads the `pnpm` key of `package.json`).
- **`better-sqlite3@13.0.3` ships prebuilt binaries for `win32-x64`, `linux-x64` and `linuxmusl-x64`** — verified
  by the PM. So **no `node-gyp`, no `python`, no `build-essential` in the image**, and Alpine works too. Do not
  add compiler toolchains "just in case"; if the install genuinely needs them, that is a finding worth reporting.
- **`@resvg/resvg-js@2.6.2` resolves a per-platform optional dependency** (`-win32-x64-msvc` here,
  `-linux-x64-gnu` in a glibc container, `-linux-x64-musl` on Alpine). The lockfile carries all of them, so a
  fresh `pnpm install` **inside** the image gets the right one. **Never `COPY node_modules` from the host into
  the image** — that is the classic way to ship a Windows `.node` into a Linux container.
- `satori` needs the font files under `apps/api/assets/` (committed by W0.5) — make sure your image actually
  contains them and that a pruned/deploy build does not drop them.

### The two container gotchas that matter here
1. **SQLite on a bind mount under WSL2 is slow and lock-prone (R12).** D13 says **named volume**. The API's
   `DATABASE_URL=file:/data/pcpi.db` and the volume `pcpi-data` mounts at `/data`. The API process must be able
   to create the file: either run as a user that owns `/data`, or `chown` it in the image. Test a **cold start on
   an empty volume** — that is the case that breaks.
2. **`adapter-node` needs `PORT`, `HOST` and `ORIGIN`.** SvelteKit's node adapter rejects form-action POSTs when
   `ORIGIN` (or `PROTOCOL_HEADER`/`HOST_HEADER`) is unset behind a proxy/port map — set `ORIGIN` explicitly in
   compose so the build page's form actions work in the container, and `HOST=0.0.0.0` so it is reachable.

### Port map (§6 W0.6 as written): host `3000` → api `3000`, host `5173` → web `3001`
Adapter-node listens on `PORT`; set `PORT=3001` for the web service so the mapping is `5173:3001`.
`API_URL=http://api:3000` for the web container (service DNS on the compose network, **not** `localhost`).

## Contracts
- `GET /health` returns `{ ok, version, db }` — that is the `HEALTHCHECK` target and the CI readiness probe.
- The compose file must bring the stack up with **no `.env` required**: every variable has a working default.
  `API_TOKEN` unset ⇒ the API is open (D3) — correct for local compose; note it in the README delta.
- Nothing in this brief may change application behaviour. If a container reveals an app bug, **report it,
  do not fix it in someone else's file** — the PM routes it.

## Scope
**May edit / create:** `docker/Dockerfile.api`, `docker/Dockerfile.web`, `compose.yaml` (repo root),
`.dockerignore` (repo root), `.github/workflows/ci.yml`, `docker/README.md` (optional).
**May edit narrowly, and only if genuinely required — say so loudly in the report:** root `package.json` (to add a
`docker:*` convenience script), `apps/*/package.json` (to add a `start` script the image invokes).
**Read-only:** all application source (`apps/**/src`, `packages/**`, `tools/**`), root TS/Biome config,
`CLAUDE.md`, `README.md`, ADRs, `docs/**`. Doc deltas go in your report's `Follow-ups`.

## Deliverables
1. **`docker/Dockerfile.api`** — multi-stage: a builder stage on `node:22-slim` (corepack → pnpm, `pnpm install
   --frozen-lockfile` **inside the image**, `pnpm build`, then a pruned production install), and a small runtime
   stage (`node:22-slim`, or distroless if you get it working — say which and why). Non-root user, `WORKDIR /app`,
   `EXPOSE 3000`, `HEALTHCHECK` hitting `/health`, `CMD` starting the API. Include `apps/api/assets/**` and the
   Drizzle migrations. Use BuildKit cache mounts for the pnpm store if it helps; keep the file readable.
2. **`docker/Dockerfile.web`** — same shape, SvelteKit `adapter-node` build, runtime runs `node build/index.js`
   with `PORT`, `HOST=0.0.0.0`, `ORIGIN`, `API_URL`. `EXPOSE 3001`.
3. **`.dockerignore`** — at minimum `node_modules`, `**/node_modules`, `.git`, `artifacts`, `*.db`, `*.db-*`,
   `.env*`, `pc-parts-inventory-wt`. **Getting `node_modules` out is not optional** (see Recon).
4. **`compose.yaml`** (repo root):
   - `api`: built from `docker/Dockerfile.api`, `DATABASE_URL=file:/data/pcpi.db`, volume `pcpi-data:/data`,
     ports `3000:3000`, healthcheck.
   - `web`: built from `docker/Dockerfile.web`, `API_URL=http://api:3000`, `PORT=3001`, `ORIGIN=http://localhost:5173`,
     ports `5173:3001`, `depends_on: api (condition: service_healthy)`.
   - `postgres`: **a stub behind `profiles: [postgres]`** — the service and its env only; **not exercised in M0**
     (D13, M2 does that). It must not start under a plain `docker compose up`.
   - named volume `pcpi-data`.
5. **`.github/workflows/ci.yml`** (D14): matrix `ubuntu-latest` + `windows-latest`, Node 22.14.0
   (`actions/setup-node@v4` with `node-version-file: .nvmrc`), pnpm via `pnpm/action-setup@v4` + the pnpm store
   cache, then **install → build → typecheck → lint → test → harness** in that order (the `CLAUDE.md` gate order).
   Upload `artifacts/harness/**` with `actions/upload-artifact@v4` **including on failure** (`if: always()`) —
   the `report.json`, `card.png` and `share.html` are the evidence (D14). Add an `ubuntu-latest`-only job that
   runs `docker compose build` (build only, no `up`). Trigger on `push` to `feat/**` and on `pull_request`.
   `concurrency` group to cancel superseded runs. **Do not add any secret**; `BESTBUY_API_KEY` stays unset and the
   bestbuy provider must report `configured: false`.
6. **Prove the compose stack yourself, on this machine:**
   - `docker compose up --build -d`, wait for `api` healthy,
   - import the **real** scan so there is a build to share:
     `curl -s -X POST http://localhost:3000/api/v1/imports/scans -H "Content-Type: application/json" --data-binary @tools/scanner/fixtures/MOONPC.redacted.json`
     — capture the returned `summary` and the build's `slug`,
   - `curl -s http://localhost:3000/api/v1/health`,
   - `curl -s http://localhost:5173/b/<slug>` → paste enough markup to show the item rows and the OG tags,
   - `curl -s -o card.png -w "%{http_code} %{size_download}\n" http://localhost:3000/api/v1/share/<slug>/card.png`,
   - **cold-start proof**: `docker compose down -v` (removes the volume) then `docker compose up -d` again and
     show the API creating a fresh DB and answering `/health` — then re-import and show the share page again,
   - `docker compose down` at the end; leave nothing running.
   - Report the two image sizes (`docker images`).

## Acceptance (named, runnable — paste the tails)
- [ ] `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test` still green on
      this branch (you changed no source — prove it)
- [ ] `pnpm harness --name w06` → exit 0, counters quoted (proves you did not break the workspace)
- [ ] `docker compose build` → both images built; sizes quoted
- [ ] `docker compose up --build -d` → `docker compose ps` shows `api` **healthy**; paste it
- [ ] The six `curl` proofs above, with real output (status codes, byte counts, markup excerpts)
- [ ] **Cold start on an empty volume** (`down -v` → `up`) works; paste the API log lines showing migration + seed
- [ ] `docker compose --profile postgres config` shows the stub, and a plain `docker compose up` does **not**
      start postgres — paste `docker compose ps` proving it
- [ ] `.github/workflows/ci.yml` is committed and **`actionlint` or `yq`/`python -c` parse-check it** if no
      linter is available (say which you used). CI itself is green only once pushed — **you do not push**;
      the architect does. State explicitly in the report that CI is *unverified-by-run* and why.
- [ ] `Read` the `card.png` you downloaded through the container and describe what you see

## Non-goals
- **No push, no PR, no tag, no registry login, no image publish.** Nothing outward-facing.
- No Postgres migration, driver, or exercised profile (M2).
- No Kubernetes/Helm, no reverse proxy, no TLS, no nginx.
- No application-source changes. No new runtime dependency.
- No secrets in CI, no `BESTBUY_API_KEY`, no live network calls in the harness.
- Do not change the gate order or weaken a gate to make CI pass. If a gate genuinely cannot run on
  `windows-latest`, **escalate** rather than silently excluding it.

## When to ask for help (escalation — one rung up only: the **PM (Opus)**)
`STATUS: ESCALATE` + the playbook §3 message, then stop, when: two failed attempts at the same sub-goal; a gate
fails on one OS only and the fix would touch application source; Docker fails on this machine after one retry;
you would need to push to verify something; you need a file outside Scope.

## Done definition
Playbook §9 report with real tails per gate and per `curl`, image sizes, the cold-start proof, your reading of
`card.png`, an explicit statement that CI is unverified-by-run, no TODOs, gate tails in the final commit message,
work only on `feat/m0-containers-and-ci`, doc deltas (README run instructions, `CLAUDE.md` § Commands) in
`Follow-ups`.
