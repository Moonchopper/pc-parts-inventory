# Brief: m0fix-scanner-serial  (2026-09-05, tier: sonnet, author: pm, wave: M0 fix-up)

**Goal (one sentence):** Make `Clean-Serial` strip **trailing punctuation** as well as whitespace, prove it with the
real NVMe case in both test paths, re-capture the MOONPC fixture so its redacted storage hash reflects the cleaned
serial, and re-key the one cost-basis fixture entry that hashes that serial.

**Why / where it fits:** Finding **F8** of `docs/milestones/M0-fixup.md` — Austin's NVMe reports the serial
`0000_0000_0000_0001_00A0_7523_E87F_6C0C.` with a trailing `.`, and per D8 the serial **is** the part's identity
key, so one stray period from CIM permanently forks the identity of a disk you own. Work item **FX.1**.

## Context — read these first (paths, not pastes)
- `CLAUDE.md` — commands, conventions (D8 `identityKey` rule), and § Framework notes
- `docs/milestones/M0-fixup.md` — the wave plan; finding **F8** and work item **FX.1** (including its note to the PM)
- `docs/milestones/M0-seed.md` §1 D8 (identity key), D15 (real hardware is the evidence), §7 (integration gate)
- `tools/scanner/ScanLib.ps1` — `Clean-Serial` at line 62 and the `$script:PlaceholderSerials` list above it
- `tools/scanner/scan.ps1` — the `-SelfTest` block, `Clean-Serial` assertions at lines 106–116
- `tools/scanner/ScanLib.Tests.ps1` — Pester 3.4 (`Should Be`, **not** `Should -Be`) `Describe 'Clean-Serial'`, lines 28–56
- `tools/scanner/README.md` line ~71 — the sentence that currently documents the *old* behaviour
- `tools/scanner/fixtures/MOONPC.redacted.json` — the committed fixture you re-capture
- `packages/contracts/fixtures/cost-basis.json` — see **Contracts** below for why this is in scope
- `tools/harness/checks/35-cost-basis.ts` — reads that file, keyed by D8 `identityKey`; fewer than 2 matches fails

## Recon (PM, 2026-09-05 — grep already done, don't redo it)
- `Clean-Serial` call sites: `scan.ps1:242` (cpu), `:355` (memory), `:394` (storage), `:436` (baseboard), `:461`
  (monitor, on the decoded uint16 array). All go through the one function — you only change `ScanLib.ps1`.
- **Three places assert the *current* (wrong) behaviour and must flip together:**
  `scan.ps1:116` (`-SelfTest`: "real serial with separators/trailing dot survives"),
  `ScanLib.Tests.ps1:54` (same case in Pester), `README.md:71` (prose: "even one with underscores or a trailing dot").
- **Ordering gotcha inside `Clean-Serial`:** strip trailing punctuation **before** the placeholder comparison and
  re-test for empty afterwards. `'To Be Filled By O.E.M.'` becomes `'To Be Filled By O.E.M'` — both spellings are
  already in `$script:PlaceholderSerials`, so keep both entries; and a value of `'...'` must end up `$null`, not `''`.
  The existing all-zero guard already strips non-alphanumerics before testing, so it needs no change.
- **The redaction is a hash of the cleaned value:** `-RedactSerials` writes `sha256(serial)[0:12]`. Today the
  MOONPC storage component (`CT2000T700SSD5`) carries `"serial": "74a52495955c"`; after the fix the same disk
  hashes to a different 12 hex chars. That string is **also a key in `packages/contracts/fixtures/cost-basis.json`**
  (`"74a52495955c": 20000`), which the harness's `35-cost-basis` check looks up by `identityKey` — leave it stale
  and the §7 gate loses a comparable part. That one key is why this brief's scope reaches outside `tools/scanner/`.
- The other MOONPC serial hashes (`c52bfb5b2296`, `0920ae81070e` memory; `6a91e609a805`, `12a6ea782bf6` monitors)
  have no trailing punctuation upstream and **must not change**. `c52bfb5b2296` is also a `cost-basis.json` key.
- `packages/core`'s `isPlaceholderSerial` (used by `tools/harness/checks/60-share.ts`) is a TypeScript mirror of the
  placeholder list, **not** of the punctuation rule. It is out of scope — do not touch it.
- Windows PowerShell 5.1 is the only PowerShell on this box. `"abc.".TrimEnd('.', ',', ';')` works in 5.1 and
  strips a *run* of those characters, which is what we want.

## Contracts
```powershell
Clean-Serial -Value <string?>   # -> [string] or $null
#   trim whitespace  ->  strip trailing '.' ',' ';'  ->  trim again  ->  '' => $null
#   ->  placeholder list (case-insensitive) => $null  ->  all-zero-after-separator-strip => $null
#   otherwise: returned unmodified apart from the above (internal '_' and '-' are real serial characters)
```
- Leading punctuation is **not** stripped (the plan says leading/trailing *whitespace*, trailing *punctuation*).
- `packages/contracts/fixtures/cost-basis.json`: replace **only** the key `"74a52495955c"` with the new hash of the
  same disk, keeping the value `20000`. Do not add, remove or re-value any other entry. It is a JSON object of
  `identityKey → acquiredPriceCents`; the file's blank-line grouping (sample fixture keys above, MOONPC keys below)
  is deliberate — keep it.
- `tools/scanner/fixtures/MOONPC.redacted.json` must still satisfy `ScanPayload` (`schemaVersion: 1`).

## Scope
**May edit:** `tools/scanner/ScanLib.ps1`, `tools/scanner/scan.ps1` (the `-SelfTest` block only),
`tools/scanner/ScanLib.Tests.ps1`, `tools/scanner/README.md`, `tools/scanner/fixtures/MOONPC.redacted.json`,
`packages/contracts/fixtures/cost-basis.json` (the one key above — nothing else).

**Read-only:** everything else, including all of `apps/`, `packages/*/src`, `tools/harness/`, `compose.yaml` and
`CLAUDE.md`. Shared docs are integrator-owned during fan-out — doc deltas go in your report's `Follow-ups`.

## Acceptance (named, runnable)
Worktree `d:\pc-parts-inventory-wt\scanner-serial`, branch `feat/m0-fix-scanner-serial` (already created for you;
run `pnpm install --frozen-lockfile` there first). Run everything from that worktree root.
- [ ] `powershell -NoProfile -File tools\scanner\scan.ps1 -SelfTest` green, with a **new** assertion:
      `Clean-Serial '0000_0000_0000_0001_00A0_7523_E87F_6C0C.'` → `0000_0000_0000_0001_00A0_7523_E87F_6C0C`
      (no trailing dot), plus a case for a trailing `,`/`;` and one proving `'.'`-only input → `$null`, and every
      existing placeholder assertion still passing.
- [ ] `powershell -NoProfile -Command "Invoke-Pester tools\scanner\ScanLib.Tests.ps1"` green with the same new
      cases in `Describe 'Clean-Serial'`. If Pester is not installed on this box, say so with the error text and
      lean on `-SelfTest` (that fallback is why `-SelfTest` exists) — **do not** install a module.
- [ ] **Re-capture the fixture on this machine:**
      `powershell -NoProfile -File tools\scanner\scan.ps1 -OutFile tools\scanner\fixtures\MOONPC.redacted.json -RedactSerials -Pretty`
      then `git diff tools/scanner/fixtures/MOONPC.redacted.json`. **The only differences may be `host.scannedAt`
      and the one storage `serial` hash.** Paste that diff in the report. If anything else moved (a component
      appeared/disappeared, a model string changed, another serial hash changed), **stop and escalate** — that is
      new information about the machine, not a scanner fix.
- [ ] Prove the new hash is exactly the cleaned serial, not a coincidence: compute
      `sha256('0000_0000_0000_0001_00A0_7523_E87F_6C0C')[0..11]` independently (e.g. a PowerShell one-liner) and
      show it equals the fixture's new storage `serial` value **and** the new `cost-basis.json` key.
- [ ] `pnpm --filter @pcpi/contracts validate tools/scanner/fixtures/MOONPC.redacted.json` green
- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm test` green (nothing you touch is TypeScript, but the
      fixture files are consumed by tests — prove they still are)
- [ ] `pnpm harness --name fx-scanner --fixture tools/scanner/fixtures/MOONPC.redacted.json` green. Quote from
      `artifacts/harness/fx-scanner/report.json`: `importsIdempotent`, `productsCreated`, `partsCreated`,
      `buildsCreated`, `quotesRecorded`, `valuation`, `share.json.items`, `share.md.rows`, `card.bytes` — and
      confirm the `cost-basis` check reports **≥ 2 parts patched** (that is the assertion the re-keying protects).
- [ ] **`Read` `artifacts/harness/fx-scanner/card.png`** and say in one line what the card shows (name, item rows,
      the Paid/Now/Δ figures) — an image nobody looked at is not evidence.
- [ ] **No listener of yours is left running:** `netstat -ano | findstr LISTENING` tail in the report showing no
      `node`/`tsx` of yours. **Ports 3000 and 5173 belong to Austin's Docker stack — never bind them.** The harness
      picks ephemeral ports on its own; if you need a manual API, use `PORT=3020`+ and stop it before reporting.

## Non-goals
- **Do not** change what counts as a *placeholder* serial, and do not touch `packages/core`'s `isPlaceholderSerial`.
- **Do not** normalise serials anywhere in the TypeScript import path (`packages/core/src/normalize.ts`). Old rows
  in an existing dev DB keep the old identity key; that is **documented-not-fixed** — the dev DB is disposable
  (`apps/api/data/pcpi.db*`) and the container is reset with `docker compose down -v`. The PM says so in the test
  guide; put nothing about it in code.
- **Do not** touch manufacturer/model cleanup, monitor decoding, or any other scanner behaviour. F8 only.
- **Do not** re-run or re-record any other fixture (`packages/contracts/fixtures/scan.sample.json` stays as is).
- No new dependencies, no PowerShell modules installed.

## When to ask for help (escalation — one rung up only)
Escalate to **the PM (Opus)** when any of: two failed attempts at the same sub-goal; the re-captured scan differs
from the committed fixture beyond `scannedAt` + the one storage hash; CIM/WMI is unavailable in your session so the
re-capture cannot run; a test can't go green without weakening it; toolchain failure after one retry; anything
destructive or outside the scope above. Use the §3 message format from
`~/.claude/playbook/multi-agent-playbook.md`, return `STATUS: ESCALATE`, and stop — you will be resumed.

## Done definition
Report in playbook §9 format: `STATUS`, `Changed`, `Verified` (command + output tail per gate — **show output,
don't claim**), `Evidence` (the fixture diff, the hash proof, the harness counters quoted, your one-line reading of
`card.png`), `Open issues`, `Escalations`, `Follow-ups`. Gate tails also go in the final commit message. No TODOs.
Commit on `feat/m0-fix-scanner-serial` in your worktree — never on `main`, never on `feat/m0-seed`. Do not merge.

---

## Addendum — D19: deterministic component order (architect ruling, 2026-09-05, mid-brief)

**Why:** the re-capture came back with MOONPC's three monitors in a different array position (WMI enumeration
order is unstable and reproducibly so). Hand-normalising the fixture back to the old order hides the problem
rather than fixing it; the architect's ruling is that the *scanner* must emit a stable order, so the committed
fixture is a canonical artifact and every future fixture diff is readable. Recorded as **D19** in
`docs/milestones/M0-fixup.md`. D8 is unaffected — import keys on identity, never on position.

**Contract:**
```powershell
# ScanLib.ps1 — new, exported, unit-testable (do not inline this in scan.ps1's emit path):
Sort-ScanComponents -Components <object[]>   # -> object[] in a deterministic order
#   category, in the M0-seed.md §3 display order:
#     cpu, cpu_cooler, motherboard, memory, storage, gpu, case, psu, case_fan,
#     monitor, os, keyboard, mouse, headset, other
#   then manufacturer, then model, then (serial ?? slot ?? '') — all case-insensitive.
```
- An unknown/unlisted category sorts last (after `other`), never crashes.
- **`Sort-Object` is not stable in Windows PowerShell 5.1.** Two components that produce an identical key must
  still come out in a fixed order, so add a final tiebreak on the component's own compact JSON
  (`ConvertTo-Json -Compress -Depth 10`) — that guarantees byte-identical output for an identical multiset of
  components. This is an implementation detail of the last resort, not a change to the key order above.
- Sorting happens **once, just before emit**, so `-OutFile`, the `-ApiUrl` POST body and the redacted fixture all
  carry the same order.

**Scope addition:** none beyond the files you already have (`ScanLib.ps1`, `scan.ps1`, `ScanLib.Tests.ps1`,
`README.md`, the fixture). `packages/contracts/fixtures/cost-basis.json` stays as you left it — the storage key
does not change again.

**Acceptance additions:**
- [ ] `-SelfTest` and Pester both cover `Sort-ScanComponents`: category order (a shuffled input comes back in §3
      order), manufacturer/model/serial tiebreaks, case-insensitivity, an unknown category sorting last, and two
      identical-key components coming out in a fixed order.
- [ ] **Two consecutive real captures are byte-identical except `host.scannedAt`.** Capture twice to temp files,
      diff them, and paste the proof (the only differing line is `scannedAt`).
- [ ] **Re-capture the committed fixture after the sort lands** (`-RedactSerials`), replacing the hand-normalised
      one. Its diff vs. the *current committed* file may now legitimately show the monitor reordering as well as
      `scannedAt` — that is expected, once. Paste the diff.
- [ ] `pnpm --filter @pcpi/contracts validate tools/scanner/fixtures/MOONPC.redacted.json` green, and
      `pnpm harness --name fx-scanner2 --fixture tools/scanner/fixtures/MOONPC.redacted.json` green with the same
      counters as before (the order change must not move `productsCreated=9`, `partsCreated=10`,
      `quotesRecorded=4`, `share.json.items=9`, `share.md.rows=9`, cost-basis matching **4** parts).
- [ ] The `netstat` check again, and the gate tails in the commit message as before.

**Non-goal:** do not sort or re-order anything on the TypeScript side (`packages/core/src/normalize.ts`, the API's
item ordering) — the API already sorts its own output (`compareByCategoryOrder`), and that is a different rule
serving a different surface.
