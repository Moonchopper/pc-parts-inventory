# Brief: m0-web-share-and-inventory  (2026-09-05, tier: sonnet, author: pm, wave: M0 Seed / W0.4)

**Goal (one sentence):** A SvelteKit 2 / Svelte 5 web app that is a **pure API client** — inventory table, builds
list, build detail with valuation, and an SSR `/b/[slug]` share page that reads with JavaScript disabled and
unfurls in Discord.

**Why / where it fits:** W0.4 of `docs/milestones/M0-seed.md` §6, in parallel with W0.3 and W0.5 on top of the
merged W0.1 seed. Pillar 3 — *sharing is one click: a build has a URL, the page reads well without JS and unfurls
in Discord/Reddit.* D2 is the hard rule this brief exists to prove: **the API is the product; the web never
touches the DB.**

## Worktree and branch (work only here)

```
worktree: d:\pc-parts-inventory-wt\web-share-and-inventory
branch:   feat/m0-web-share-and-inventory   (created from feat/m0-seed AFTER W0.1 merged)
```
Run `pnpm install` in the worktree first. Never commit to `main` (it does not exist) or to `feat/m0-seed`.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions, and **§ Framework notes** (W0.1 pinned the versions and wrote the
  Svelte-5/zod/Drizzle/Hono gotchas there — read it before your first `.svelte` file).
- `docs/milestones/M0-seed.md` — §1 D2, D7 (slug + visibility), §4 DTOs (`Part`, `Build`, `Valuation`,
  `SharedBuild`), §5 API surface, §6 W0.4.
- `docs/adr/0001-stack.md` — R6 (share page: SSR, no-JS, OG unfurl), R7, R13; and the **revisit trigger**: *if
  Sonnet's web briefs average more than one PM send-back for framework-version drift, SvelteKit gets replaced.*
  Treat that as a personal challenge — read the pinned Svelte 5 notes before writing runes.
- The merged seed: `packages/contracts/openapi.json` and `packages/contracts/generated/client.d.ts` (your types),
  `packages/contracts/src/**` (the DTO schemas), `tools/harness/harness.ts` + `tools/harness/checks/` (the check
  pattern), `apps/api/src/share/routes.ts` (the exact JSON shape `/share/{slug}` returns).
- `~/.claude/playbook/multi-agent-playbook.md` §3, §6, §9.

## Recon (by the PM)

### Versions — already resolved, this graph is consistent (verify against `CLAUDE.md` § Framework notes; W0.1's
pins win if they differ)
```
svelte 5.57.0   @sveltejs/kit 2.70.3   @sveltejs/adapter-node 5.5.7
@sveltejs/vite-plugin-svelte 7.3.0   vite 8.2.2   svelte-check 4.7.6   openapi-fetch 0.17.0
```
Peer facts checked by the PM on 2026-09-05: `@sveltejs/vite-plugin-svelte@7.3.0` requires **`vite ^8` and
`svelte ^5.46.4`**; `@sveltejs/kit@2.70.3` accepts `vite ^5||^6||^7||^8`, `svelte ^5`, `typescript ^5.3.3 || ^6`,
`vite-plugin-svelte ^7`; `svelte-check@4.7.6` accepts `typescript ^5 || ^6`; engines need Node `^22.12` (this box
is 22.14.0 — fine). **W0.1 pinned TypeScript 5.9.3** — do not bump it.

### The five things that will bite you
1. **Svelte 5 runes only.** `$state`, `$derived`, `$props`, `$effect`. **No `export let`, no `$:`, no
   `createEventDispatcher`, no `<slot>`** (use `{@render children()}` and snippet props). Sonnet's default
   Svelte instinct is Svelte 4 — this is the single most likely source of a send-back, and ADR-0001 names it.
2. **`+page.server.ts` for everything on the share path.** `/b/[slug]` must render fully server-side and be
   correct with JS disabled: SSR load, plain `<form method="POST">` + form actions for the build page's
   add/remove, no client-only fetch for anything that must appear in the HTML. Test it by fetching the URL with
   `curl` and reading the markup — that is what Discord's unfurler does too.
3. **`API_URL` is server-side only.** Create the API client in `src/lib/server/api.ts` and use it only from
   `+page.server.ts` / `+server.ts`. Do not leak it into `$env/static/public`. Use
   `$env/dynamic/private` so the container can set it at run time (W0.6 sets `API_URL=http://api:3000`).
   Default to `http://127.0.0.1:3000` for local dev.
4. **`og:image` must be an absolute URL.** Discord will not resolve a relative one. Build it from the request
   origin (`url.origin` in `load`) + `/api/v1/share/{slug}/card.png`, or from a `PUBLIC_ORIGIN` env with the
   request origin as the fallback. **The PNG endpoint itself is W0.5's** and may 404 in your worktree — the tag
   must still be emitted and point at the right URL.
5. **W0.3 and W0.5 are running right now, in parallel.** `GET /builds/{id}/valuation` (W0.3),
   `GET /share/{slug}.md` and `/share/{slug}/card.png` (W0.5) **may not exist on your branch**. Code against the
   §4 `Valuation` DTO type, handle a 404/`null` by rendering "valuation unavailable" (build page) and simply
   omitting the totals row (share page), and **do not implement any API endpoint yourself**. The PM re-runs the
   full harness after all three merge.

### Seams (do not rebuild them)
- Harness: **add exactly one new file** `tools/harness/checks/40-web.ts`. Checks are discovered by reading the
  directory; there is no registry to edit. **Do not touch `tools/harness/harness.ts`** — W0.3 and W0.5 are adding
  their own check files at the same time.
- `report.json` counters you own (W0.1 seeded them at zero): `counters.share.html.ogTags`,
  `counters.share.html.bytes`. Do not rename or reorder anything else.
- Root scripts already use `pnpm -r --if-present <script>`, so **adding `apps/web` needs no root file change**:
  give the package its own `build`, `typecheck` (= `svelte-kit sync && svelte-check --fail-on-warnings` … your
  call on warnings, but 0 errors is required), `test` and `dev` scripts and the root picks them up.
  `pnpm-workspace.yaml` already globs `apps/*`. **Do not edit root `package.json` or `pnpm-workspace.yaml`.**
- **Ephemeral ports.** Two other implementers run `pnpm harness` concurrently. Your harness check must start the
  built web server on a free port (`PORT=0` is not honoured by adapter-node — pick a free port by opening a
  `net.createServer().listen(0)`, reading `address().port`, closing it, and passing that as `PORT`) and must
  point it at the harness's ephemeral `apiUrl` from `HarnessCtx`. Never hard-code 5173 or 3000.

## Contracts (satisfy exactly; if one must change, escalate)
- Types come **only** from `packages/contracts` and its generated client. §4 `SharedBuild` is the exact shape
  `/share/{slug}` returns; it deliberately has **no serials, no notes, no acquiredSource, no owner data** —
  the share page must not display or request any of that.
- D7: `/b/{slug}`; `private` ⇒ the API 404s ⇒ the page renders SvelteKit's 404, not an error dump.
- The §4 error shape `{ error: { code, message, details? } }` is what non-2xx responses look like; surface
  `error.message`, never a stack trace.

## Scope
**May edit / create:** `apps/web/**` **only** (including `apps/web/package.json`, `svelte.config.js`,
`vite.config.ts`, `tsconfig.json`, `src/**`, `static/**`, `tests/**`), plus the single new file
`tools/harness/checks/40-web.ts`.
**Read-only:** everything else — `apps/api/**`, `packages/**`, `tools/harness/harness.ts`, `tools/scanner/**`,
root config, `docker/**`, `.github/**`. **`CLAUDE.md`, `README.md`, ADRs and `docs/**` are PM-owned during
fan-out** — put doc deltas in your report's `Follow-ups`.
**Absolutely forbidden (D2, and the PM will `git diff` for it):** any import of `drizzle-orm`, `better-sqlite3`,
`@pcpi/api`, or anything under `apps/api/` from `apps/web`. Add an ESLint-style guard if you like, but at minimum
say in your report that you grepped for it and paste the empty result.

## Deliverables
1. **`apps/web`** — SvelteKit 2 with `@sveltejs/adapter-node`, TS strict, Svelte 5 runes, Biome-clean (the root
   `biome.json` governs; if Biome cannot parse `.svelte`, exclude those files in a way that keeps `pnpm lint`
   green and **say so in your report** so the PM knows lint coverage is partial).
2. **API client** — `openapi-fetch` over `packages/contracts`'s generated types, in `src/lib/server/api.ts`,
   base URL from `API_URL`. One place that turns a non-2xx into a typed error using the §4 error shape.
3. **Routes**
   - `/` **inventory**: parts table with columns *category, product, serial, condition, status, acquired,
     current, delta*. Sortable/filterable is a bonus, not a requirement; correct and readable is the requirement.
     Money rendered from integer minor units + currency (**never** `toFixed` on a float you built by dividing).
   - `/builds` — list.
   - `/builds/[id]` — items + valuation; **add/remove a part via form actions** (`POST` to `/builds/{id}/items`
     and `DELETE /builds/{id}/items/{partId}` on the API). Works with JS disabled. If `API_TOKEN` is set in the
     web server's env, send it as `Authorization: Bearer` on writes.
   - `/b/[slug]` — **the share page.** SSR, no-JS-readable, `<title>`, `<meta name="description">`, and the four
     OG tags `og:title`, `og:description`, `og:image`, `og:url` (plus `twitter:card` = `summary_large_image` as a
     bonus). `og:image` absolute → `/api/v1/share/{slug}/card.png`. A **"copy Markdown" button** that fetches
     `/api/v1/share/{slug}.md` and copies it (progressive enhancement — the page must still be complete without
     it; when JS is off, show the link to the `.md` URL instead). 404 for private/unknown slugs.
4. **Harness check `tools/harness/checks/40-web.ts`**: build `apps/web`, start `node build/index.js` with
   `API_URL=<ctx.apiUrl>` and `PORT=<free>`, wait for readiness, `GET /b/{slug}`; assert **200**, assert the four
   OG tags are present (count them into `counters.share.html.ogTags`), assert **every item's `model` string from
   the share JSON appears in the HTML**, write the body to `artifacts/harness/<name>/share.html`, set
   `counters.share.html.bytes`, set `ctx.webUrl`, and shut the server down cleanly (kill the child on both
   success and failure — a leaked node process will hang the next implementer's harness run).
5. **Component tests** (vitest) for the pure bits: money formatting, delta sign/colour logic, the OG-tag builder.
   Keep them fast and DOM-light; the harness is where the real page is proven.

## Acceptance (named, runnable — paste the tails)
- [ ] `pnpm install` then `pnpm build` green (SvelteKit build output listed)
- [ ] `pnpm typecheck` green — **`svelte-check` reports 0 errors**; quote its summary line
- [ ] `pnpm lint` green (say what, if anything, is excluded)
- [ ] `pnpm test` green
- [ ] `pnpm harness --name w04` → exit 0; quote `counters.share.html.ogTags` and `counters.share.html.bytes` from
      `artifacts/harness/w04/report.json`, plus the W0.1 counters to prove no regression
- [ ] **`Read` `artifacts/harness/w04/share.html` yourself** and describe in the report what the page actually
      contains: the build name, how many item rows, the four OG tags with their real values
- [ ] **No-JS proof:** `curl -s http://127.0.0.1:<port>/b/<slug>` (or the saved `share.html`) shows the item rows
      in the markup, not an empty shell — paste the relevant markup excerpt
- [ ] **D2 proof:** `grep -rn "drizzle\|better-sqlite3\|apps/api" apps/web/src` → no matches (paste the result)

## Non-goals
- No API endpoints. If a page needs data the API doesn't expose, **escalate** — do not add a SvelteKit
  `+server.ts` that reaches around the API for it. (A `+server.ts` that *proxies* the API is acceptable only if
  you explain why in the report.)
- No Markdown/PNG generation — that is W0.5's; you only link to and fetch those endpoints.
- No barcode capture, no PWA manifest/service worker (M2). No auth UI (D3).
- No Tailwind or a component library unless you justify it and pin it exactly — plain CSS in `+layout.svelte`
  and scoped component styles are expected. **No new dependency the brief did not name.**
- No editing of root config, the harness runner, or another brief's files.

## When to ask for help (escalation — one rung up only: the **PM (Opus)**)
`STATUS: ESCALATE` + the playbook §3 message, then stop, when: two failed attempts at the same sub-goal (in
particular, **framework-version drift you cannot resolve in two tries — escalate rather than downgrade a pin**);
you need an API change; a test can only go green by weakening it; you need a file outside Scope; a toolchain
failure survives one retry.

## Done definition
Playbook §9 report with real tails per gate, `artifacts/harness/w04/report.json` counters quoted, your own reading
of `share.html`, the D2 grep, no TODOs, gate tails in the final commit message, work only on
`feat/m0-web-share-and-inventory`, doc deltas in `Follow-ups`.
