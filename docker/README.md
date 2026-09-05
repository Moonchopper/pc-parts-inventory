# Running PC Parts Inventory in containers (M0 W0.6)

```
docker compose up --build -d
docker compose ps                 # wait for api -> healthy
curl -s http://localhost:3000/api/v1/health
```

Two services, one compose file, one named volume:

- **`api`** — `docker/Dockerfile.api`, port `3000`, SQLite at `/data/pcpi.db` on the named volume
  `pcpi-data` (never a bind mount — SQLite on a WSL2 bind mount is slow and lock-prone, ADR-0001
  R12/D13). The DB file, schema and owner row are all created on first boot; there is nothing to
  provision by hand, including on a brand-new (or freshly `docker compose down -v`'d) volume.
- **`web`** — `docker/Dockerfile.web`, port `5173` (host) -> `3001` (container), SvelteKit
  `adapter-node`, talks to `api` over the compose network (`API_URL=http://api:3000`).
- **`postgres`** — a stub only (image + env, `profiles: [postgres]`). Not started by `docker compose
  up`; M2 is what actually exercises it. Bring it up explicitly with
  `docker compose --profile postgres up` if you need to poke at it.

No `.env` file is required — every variable has a working default baked into the images or set
directly in `compose.yaml`.

## `API_TOKEN` is intentionally unset

Per D3, an unset `API_TOKEN` means the API accepts unauthenticated requests. That is correct for
this local compose file. Set `API_TOKEN` as a compose environment override (and pass the matching
token from `web`/callers) once auth actually needs to be exercised.

## `ORIGIN` — a real bug this brief fixed, not a knob to remove

`@sveltejs/adapter-node` defaults the *scheme* of the request origin it reconstructs to `https`
unless `ORIGIN` (or a trusted `PROTOCOL_HEADER`) is set (see `get_origin` in the adapter's
`handler.js`). The share page builds `og:url`/`og:image` from that origin
(`apps/web/src/lib/og.ts` / `+page.server.ts`) — left unset, both tags would claim `https://` on
this plain-HTTP container, and Discord/Reddit fetch exactly those URLs to unfurl a shared build, so
the unfurl would silently fail while every other gate stayed green. `compose.yaml` sets
`ORIGIN=http://localhost:5173` on `web` for exactly this reason; verified live:

```
$ curl -s http://localhost:5173/b/<slug> | grep -E 'og:(url|image)'
<meta property="og:image" content="http://localhost:5173/api/v1/share/<slug>/card.png"/>
<meta property="og:url" content="http://localhost:5173/b/<slug>"/>
```

**Deploying behind a reverse proxy instead of this direct port map?** Don't hardcode `ORIGIN` —
set `PROTOCOL_HEADER=x-forwarded-proto` and `HOST_HEADER=x-forwarded-host` on `web` so the origin
tracks whatever the proxy actually terminates, and have the proxy forward those headers.

**Known gap this did *not* fix (found while proving the above, reported not fixed — out of this
brief's Scope):** `buildOgImageUrl` (`apps/web/src/lib/og.ts`) builds `og:image` relative to the
*page's* origin (`/api/v1/share/{slug}/card.png` under `http://localhost:5173`), but `apps/web`
does not itself proxy `/api/v1/*` to the API — only the `api` container answers that path (port
`3000`). So while the scheme is now correct, fetching the `og:image` URL exactly as written 404s
from inside this two-port, no-reverse-proxy compose file:

```
$ curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/api/v1/share/<slug>/card.png
404
$ curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/share/<slug>/card.png
200
```

This is a pre-existing application-layer assumption (one unified public origin in front of both
containers, e.g. a reverse proxy routing `/api/*` to `api` and everything else to `web`) that M0's
two-container-no-proxy topology doesn't yet provide, not something introduced by this brief's
compose/Dockerfile changes. Reported to the PM to route; a reverse proxy is an explicit Non-goal
here.

## Native module: `better-sqlite3` and the builder-only toolchain

`better-sqlite3` ships prebuilt binaries for `linux-x64`/`linuxmusl-x64` (and more), but it also
ships a `binding.gyp` with no explicit install script, so pnpm's allow-listed build step
(`pnpm-workspace.yaml`'s `onlyBuiltDependencies`/`allowBuilds`) falls back to an implicit
`node-gyp rebuild` instead of reusing the shipped prebuild. `docker/Dockerfile.api`'s **builder**
stage installs `python3 make g++` so that succeeds regardless of platform quirks; the **runtime**
stage starts fresh from `node:22.14.0-slim` and never sees a compiler.
`docker/Dockerfile.web`'s builder gets no toolchain at all — its filtered install
(`--filter @pcpi/web...`) never resolves `better-sqlite3` in the first place.

## Image sizes (this machine, cold build)

- `containers-and-ci-api:latest` — 717 MB
- `containers-and-ci-web:latest` — 592 MB

Both stages copy the whole built/pruned `/app` tree from builder to runtime (simplest way to keep
pnpm's per-package `node_modules` symlinks — relative paths into the root `node_modules/.pnpm`
store — valid; cherry-picking individual subpaths breaks them). That is bigger than the
distroless-class images ADR-0001 R2 sizes for other languages; a follow-up brief could shrink this
with a `pnpm deploy`-based image (blocked today because `dist/` is `.gitignore`d and `pnpm deploy`
follows npm-packlist/`.gitignore` semantics without a `files` field) or a hand-picked multi-COPY
runtime stage.
