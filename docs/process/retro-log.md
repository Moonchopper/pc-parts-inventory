# Retro log — PC Parts Inventory

One entry per milestone, using the template in `~/.claude/playbook/multi-agent-playbook.md` §12.

<!-- entries below, newest first -->

## M0 — Seed (2026-09-05, one session)

```
Milestone: M0 Seed                       Dates: 2026-09-05 (one session; one 429 interruption)
Waves: 1   Briefs: 8 (Sonnet 8 / Opus 0 / Fable-authored code 0) — first wave under the re-cut roles
        (Fable = architect/session, Opus = PM/PO, Sonnet = implementer)
Retries: 0 at brief level.  Send-backs by the PM: 3 rounds (W0.2 manufacturer-prefixed model; W0.1 follow-up
        reformatting a generated fixture; polish caption clipped) — each caught a real defect the implementer's own
        gates had passed.  Continuations: 1 (polish, after the account limit killed it mid-review; checkpoint +
        continuation brief, zero work redone).
Escalations: Sonnet→PM 1 (W0.3 lint-red base — reproduced, enumerated, kept working); PM→Architect 5
        (jobs.ownerId plan contradiction; SharedBuild currency; 9 unassigned §5 endpoints + share valuation never
        populated; D5 delta semantics once items are unpriced; caption wording); Architect→Austin 4 (PM scope; stack
        options, twice, after cross-platform + mobile criteria were added; share model).
What the PM's validation caught (that tests did not): model strings repeating the manufacturer (would have keyed
        quotes.json wrongly); a generated fixture reformatted by Biome (would have broken the fresh-scan ≡ fixture
        proof and made every re-scan turn lint red mid-manual-pass); share valuation fields nobody populated
        (endpoint returned 167896 while page/MD/PNG rendered "—"); a D5 fallback locked in by a unit test that
        asserted the bug; og:image correctly formed and 404ing through the web container; a card caption clipped
        after a "nothing clipped" claim; Δ ≠ Paid − Now needing an explanation on the artifact.
What the ladder caught: W0.3's escalation on the red base was answered with the same reasoning used to reject the
        same fix from W0.1 an hour earlier — consistency the implementer could not have had on its own. Implementers
        caught three brief errors (satori/resvg "pinned" only in prose; [regex]::Replace case-sensitivity; the Δ glyph
        tofu-boxing in the Latin font subset) and W0.3 refused a schema edit until the instruction was in a committed
        brief, not just a message.
What slipped past the gates (found by Austin): 13 items in a ~1 h pass, none caught by 212 tests or the harness —
        corepack recipe valid only in Git Bash; web default 127.0.0.1:3000 walks into the documented port footgun; five
        stale implementer API servers on :3010 served a fake DB to Austin's browser; guide never said the dev DB starts
        empty; PS 5.1 snippets never run in PS 5.1; raw category keys on the build page; $0.00 for "no data"; NVMe serial
        trailing '.' in the identity key; refresh = 9 calls + 30 s, run-due dead in dev; Docker-internal `api:3000` in the
        Markdown footer; no way to paste the rich preview locally; "1 parts"; Discord doesn't render MD tables.
        All → M0-fixup.md (D16–D18). Pattern: everything the agents validated, they validated from their own shell, their
        own DB and their own topology — never Austin's.
Token hot-spots (subagent tokens): W0.1 419 k (13.5 min; toolchain-proving seed) · W0.3 317 k (38 min) ·
        polish continuation 298 k (41 min; 9 tasks) · W0.4 270 k (29 min) · W0.5 262 k (34 min) · W0.6 231 k ·
        W0.2 223 k · W0.8 218 k · PM ≈ 500 k across the wave (6 resumptions) ⇒ ≈ 2.7 M subagent tokens for 37 commits,
        212 tests, a 13/13 integration gate on real hardware and a container proof.
Playbook changes: learnings 28–33 (roles re-cut; agent files load at session start; brief branches pinned to base;
        coverage-check plan rows before dispatch; the gate asserts on what the human sees; the deployed topology
        proves the product).  CLAUDE.md changes: PM applied all deltas at integration (corepack recipe, port-3000
        footgun, pins + framework notes, four conventions incl. "never render a delta computed from the two
        top-level totals").
Open at hand-over: CI never run (nothing pushed — D14 closes on the first branch push); images 717/592 MB (M1
        "container-slim"); "1 parts" pluralisation in the caption (one-liner); 7 brief worktrees on disk as evidence.
```

**Architect's notes.** The re-cut roles worked as intended on the first try: my context stayed on design and the
conversation (≈ 20 tool calls all session), the PM absorbed the fan-out and every validation, and no tier accepted
its own work. The costliest lesson was mine — a plan whose endpoint table and share contract were not reconciled
against the briefs' scopes before dispatch (learning 31) and an integration gate that read the endpoint instead
of the artifact (32). Both are now checklist items, and both were found by the PM reading a PNG. Next wave: restart
the session first so `pm`/`implementer`/`qa` load as static agent types (learning 29).
