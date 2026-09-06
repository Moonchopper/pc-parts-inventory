# M1 — Capture + delta (stub for the architect's wave plan)

*Written at M0 close (2026-09-06) so the next session starts from inputs, not archaeology. The architect (Fable)
turns this into a wave plan in the `M0-seed.md` shape — settled decisions, contracts, work items with scopes and
order, an integration gate that reads the artifacts — and dispatches the `pm` agent (a real agent type from this
session on; no more general-purpose fallback).*

## Where M0 left things
- `main` = PR #1 (58 commits): scanner → API → valuation → share page/MD/PNG → compose → CI green on ubuntu + windows.
- Test guide: `docs/process/test-guides/m0.md` (re-run in PS 5.1 by the PM). Retro: `docs/process/retro-log.md`.
- Playbook learnings 28–37 came out of M0; read them before planning (`~/.claude/playbook/multi-agent-playbook.md` §14).

## Scope (from `docs/vision/intake.md` — M1 row)
1. **Order-history import → cost basis** (pillar 1 + 2). Amazon "Request My Data" export and Newegg order history →
   `POST /imports/orders` (kind `amazon | newegg`, multipart CSV) → match order lines to owned parts/products
   (part number / title similarity, confidence + a review step, same shape as D11's provider links) → set
   `acquiredPriceCents`, `acquiredAt`, `acquiredSource`. Never overwrite a cost basis the user set by hand without asking.
2. **Barcode capture** (UPC from the retail box via the phone camera in the browser) → product lookup → shelf part.
3. **Price refresh cadence + providers**: a schedule (per owner), a "refresh all" affordance on builds/inventory, and
   the first real provider run — Best Buy with a key — plus the provider-link review UI (verify/reject matches).
   Decide Keepa (paid) and eBay-sold (access-gated) as options, not defaults.
4. **Cross-platform scanner decision** (ADR-0001 § Consequences): per-OS scripts vs one static binary
   (Go + `ghw` or Node SEA + `systeminformation`) — decide with evidence on a macOS/Linux box if one is available.

## Carry-ins from M0 (small, do first or fold into the nearest brief)
- **F14** — a cost basis can be set but not cleared: `PATCH /parts/{id}` must accept `acquiredPriceCents: null`.
- **503 page** names the internal API URL to visitors in compose — generic message in prod, detail only in dev.
- **`40-web` prerender flake** (`ENOENT .svelte-kit/output/client` right after a full build) — retry the web build once inside the check.
- **container-slim** — 717/592 MB images → `files` fields + `pnpm deploy --prod`, target < 250 MB each.
- **`PUBLIC_ORIGIN` dev default** so the guide's dev recipe doesn't have to set it.
- **CI harness on the real fixture** (`MOONPC.redacted.json`) as a second run; bump Actions to v5 (Node 20 deprecation annotations).
- **"Copy as code block"** export for Discord (renders aligned columns; tables don't) — optional, cheap.

## Open decisions for Austin (present as options, playbook §10)
- Amazon export format: the "Request My Data" ZIP vs the order-history CSV (Retail.OrderHistory) — which one he can get.
- Best Buy key: has one / wants one.
- Whether the provider-link review lives on the product page or as an inbox ("12 matches to confirm").
- Scanner binary language (Go vs Node SEA) — only if a non-Windows box exists to test on.

## Process notes for the next PM
- Learning 30: land shared seams (schemas, label helpers, harness types) on the wave branch before cutting worktrees.
- Learning 34: run the test guide's snippets in Windows PowerShell 5.1 before hand-over.
- Learning 35: implementers stop every server they start; `taskkill //PID n //T //F` (Stop-Process is classifier-blocked).
- Learning 37: verify no other PM is alive (`ListAgents` + git sampled twice) before the first dispatch.
- Coverage-check every plan row against the briefs' scopes before dispatch (learning 31); the gate reads artifacts (32/33).
