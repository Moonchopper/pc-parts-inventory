# M0 fix-up (wave plan)

*Architect: Fable, 2026-09-05, from Austin's manual pass of `docs/process/test-guides/m0.md` on `feat/m0-seed`.
Executed by a fresh `pm` agent (Opus): three parallel Sonnet briefs on disjoint scopes, PM-owned guide rewrite,
then integration on `feat/m0-seed` (continue the same wave branch — these are defects in what M0 claims to
deliver, not new scope). Decisions in `M0-seed.md` §1 still hold; D16–D18 below are additive.*

**Outcome:** every finding below is fixed with a named test or a client-shaped proof, the test guide is re-run
by the PM *in Windows PowerShell 5.1* before hand-over, and `feat/m0-seed` is ready to push for first-green CI.

## Findings (all from the human gate; none caught by 212 tests or the harness)

| # | Finding | Root cause |
|---|---|---|
| F1 | ~~corepack recipe worked only in Git Bash~~ | fixed `bc3c0fd` — `~/bin` is on Git Bash's PATH, not PowerShell's |
| F2 | `/` spun forever with the API "healthy" | web default `API_URL = http://127.0.0.1:3000`; VS Code squats `127.0.0.1:3000`; Node bound `0.0.0.0` without error |
| F3 | Austin's build page showed **SEEDPC-01** — an implementer's temp DB | five stale `tsx watch` API servers from the polish worktree still listening on `:3010` |
| F4 | Nothing said "your dev DB starts empty — scan this machine first" | guide assumed MOONPC was *in* the DB because the fixture is *in* the repo |
| F5 | Guide snippets broke in PS 5.1 (`Invoke-RestMethod` returns a JSON array as one object) | guide written for 5.1, never run in 5.1 |
| F6 | Build page shows raw `cpu` / `gpu` keys; card and MD say "Video Card" | no shared label helper; page didn't use it |
| F7 | `Paid $0.00 · Now $0.00` when nothing has a cost basis / price (build page + Markdown) | "no data" rendered as zero — same class as the D5 fallback |
| F8 | NVMe serial `…E87F_6C0C.` keeps a trailing `.` — and serial is the identity key | `Clean-Serial` doesn't strip trailing punctuation |
| F9 | Refresh = 9 API calls + a 30 s wait; `POST /jobs/run-due` 404s under `pnpm dev` | no wake-on-enqueue; `NODE_ENV` unset under `tsx watch` |
| F10 | Markdown footer links `http://api:3000/api/v1/share/{slug}` — a Docker-internal hostname, pointing at JSON | footer built from the API's own request origin (`share/routes.ts:37`) |
| F11 | No way to paste the rich preview while local-only | card exists at `/api/v1/share/{slug}/card.png`; no UI affordance |
| F12 | Caption reads "delta over the 1 parts" | pluralisation (PM report) |
| F13 | Discord doesn't render Markdown tables; guide sent Austin there | Markdown targets Reddit/forums; guide didn't say |

## Additive decisions

| # | Decision |
|---|---|
| D16 | **`PUBLIC_ORIGIN` is an API contract.** The API never derives a user-facing URL from its own request origin. `PUBLIC_ORIGIN` env (default: the request origin, dev only) is the one source for any URL that leaves the system (Markdown footer, future webhooks/emails). Compose sets it equal to the web's `ORIGIN`. A user-facing link always points at the human page `/b/{slug}`, never at `/api/v1/…`. |
| D17 | **"No data" never renders as a number.** `Paid`/`Now`/`Δ`/per-item price render `—` when the underlying coverage count is 0 or the value is absent — in every renderer (card, Markdown, share page, build page, inventory). `$0.00` appears only when a real value of 0 was recorded. |
| D18 | **Enqueue wakes the runner.** `enqueue()` schedules an immediate `runDue()` (debounced, single-flight); the 30 s tick stays as the safety net. `pnpm dev` runs the API with `NODE_ENV=development` so `POST /jobs/run-due` exists in dev. |
| D19 | **The scanner emits components in a deterministic order** (architect ruling on FX.1's escalation, 2026-09-05). `scan.ps1` sorts `components` before emit by category (the `M0-seed.md` §3 display order), then manufacturer, then model, then `serial ?? slot ?? ''` — all case-insensitive — so two consecutive captures of the same machine are byte-identical except `host.scannedAt`. WMI enumeration order is *not* stable (MOONPC's three monitors swap positions between sessions, reproducibly), which made the committed fixture a moving artifact and every fixture diff unreadable. D8 is unaffected: import keys on identity, never on position. |

## Work items (parallel — disjoint scopes; branches `feat/m0-fix-<slug>` from `feat/m0-seed`)

### FX.1 `fix-scanner-serial` (Sonnet; scope `tools/scanner/**`)
- `Clean-Serial`: strip trailing/leading whitespace **and trailing punctuation** (`.`, `,`, `;`); keep internal
  `_`. Add the NVMe case (`0000_0000_0000_0001_00A0_7523_E87F_6C0C.`) to the Pester tests and `-SelfTest`.
- **Re-capture the fixture** on this machine (`-RedactSerials`) so `MOONPC.redacted.json`'s storage hash reflects
  the cleaned serial; confirm the only diff vs. the committed fixture is that one hash (+ `scannedAt`).
- **D19 (added mid-wave by the architect, on FX.1's escalation):** sort `components` before emit; re-capture the
  fixture *after* the sort lands so the committed artifact is canonical. Two consecutive captures must be
  byte-identical except `scannedAt`.
- Acceptance: SelfTest + Pester green; fresh scan ≡ committed fixture bar `scannedAt`; `pnpm --filter
  @pcpi/contracts validate` on the new fixture.
- Note for the PM's guide: existing DBs carry the old identity key for that part — dev DB is disposable
  (`apps/api/data/pcpi.db*`), container is `down -v`. Say so in the guide's §0.

### FX.2 `fix-api` (Sonnet; scope `apps/api/**`, `packages/contracts/src/category.ts` (+ label helper), `packages/core/src/pricing/**` only if a pluralisation helper lands there, `tools/harness/checks/**`, `compose.yaml` (api env only))
- **F2 (API side):** after `serve()` binds, self-check `GET http://127.0.0.1:{port}/api/v1/health` with a 2 s
  timeout; if the response is not *this* process's `version`/instance id → log one loud line naming the port and
  the `netstat -ano | findstr :{port}` hint, exit 1. A named test with a stub listener on `127.0.0.1`.
- **F6:** `categoryLabel(category)` in `packages/contracts` beside `categoryOrder` (the card/MD already have a
  table — move it there; one source).
- **F7 / D17:** Markdown + card render `—` per D17; tests for `withAcquired == 0`, `withCurrent == 0`, both.
- **F9 / D18:** wake-on-enqueue; `NODE_ENV=development` for `pnpm dev` (mechanism free: `cross-env` is an
  allowed new dev dependency if Node's `--env-file` can't be passed through `tsx watch`). Acceptance: under
  `pnpm dev`, `POST /products/{id}/refresh` → quote visible in `GET …/quotes` within 2 s **without** calling
  `run-due`; `POST /jobs/run-due` → 200.
- **F10 / D16:** `PUBLIC_ORIGIN`; footer `${PUBLIC_ORIGIN}/b/${slug}`; `compose.yaml` api service gets
  `PUBLIC_ORIGIN: http://localhost:5173`. Test: footer never contains `api:` or `/api/v1/`.
- **F12:** pluralise (`1 part` / `2 parts`) in the shared caption helper; test both.
- **Harness:** `60-exports` asserts the MD footer contains `/b/{slug}` and not `/api/v1/`; a new check asserts
  the D17 `—` states on a build with no cost basis before `35-cost-basis` runs (ordering: name it `32-…`).

### FX.3 `fix-web` (Sonnet; scope `apps/web/**`)
- **F2 (web side):** default `API_URL` → `http://localhost:3000`; the SSR fetch gets a 5 s timeout and renders a
  readable error page ("API not reachable at … — is it running? port footgun: …") instead of spinning.
- **F6:** build page + inventory use `categoryLabel` from contracts.
- **F7 / D17:** share page, build page, inventory render `—` per D17; component tests.
- **F11:** share page gains **Copy card image** (fetch same-origin `/api/v1/share/{slug}/card.png` → 
  `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])`, success/failure toast) and a plain
  **Download card** link that works with JS disabled. Progressive enhancement: the button renders only with JS.
- **F12:** same caption helper (import from contracts/core — not a second copy).

### FX.4 `guide-and-handover` (PM-owned; `docs/process/test-guides/m0.md`, `CLAUDE.md` § Commands)
- §0: "your dev database starts **empty**; the MOONPC fixture is a file, not data" + the disposable-DB note (FX.1)
  + the port-3010 recipe as the default dev invocation + the PS 5.1 array quirk (`(Invoke-RestMethod …) |`).
- §1: scan **this** machine first, then a second one.
- §2: the refresh recipe, PS 5.1-tested, expecting a quote within 2 s (D18).
- §3: Discord doesn't render tables — paste the link (once public) or **Copy card image**; Markdown is for
  Reddit/forums. Add the copy-card step.
- **Hand-over gate (new, permanent):** before reporting, the PM runs the guide's §0 and every snippet in
  `powershell -NoProfile` (Windows PowerShell 5.1) on this box, from a clean `pnpm dev`, and pastes the tails.
  A snippet that fails in 5.1 is a guide defect, not Austin's.

## Integration gate (PM, on `feat/m0-seed`)
1. §7 of `M0-seed.md` (13 assertions + the two new checks) on the re-captured fixture.
2. Compose proof, client-shaped: `og:image` via web origin → `200 image/png`; `.md` via web origin → footer
   contains `http://localhost:5173/b/` and not `api:`; `GET /` renders `—` not `$0.00` on a fresh import.
3. **Process hygiene:** `netstat -ano | findstr LISTENING` shows no listener owned by any agent's `node` on
   3000/3010/5173 after integration; every implementer's report includes the same check for its own ports.
4. FX.4's hand-over gate tails.
5. Wave report; then the architect asks Austin for the branch push (first-green CI, D14).
