# Intake — PC Parts Inventory

*Phase 0 (playbook §4). Drafted by the architect 2026-09-05 from the kickoff conversation; **pending Austin's
confirmation** of the pillars and the open decisions below.*

## Problem

Tracking owned PC hardware today means PCPartPicker plus a lot of typing. It has no API, no export, and no
notion of "what I paid vs. what it's worth now". Inventorying is manual, price change is invisible, and the
one thing PCPartPicker does brilliantly — a build is a URL you can paste anywhere — is the bar to clear.

## Goals

1. An inventory of owned parts with **near-zero manual entry**.
2. **Paid-vs-now** price per part and per build, refreshed automatically, with a history we own.
3. Builds (part lists) that are **as shareable as PCPartPicker's** — a URL, and exports that paste well.
4. **Self-hosted locally first**, designed so it can become a hosted product without a rewrite.

## Pillars (ordered — when two conflict, the earlier wins)

1. **Capture is automated.** Importers, not forms. Manual entry is the fallback, never the path.
2. **Price delta is first-class.** Every quote we fetch is recorded; the history table is ours regardless of
   which provider we can reach this month.
3. **Sharing is one click.** A build has a URL and an export; the page reads well without JS and unfurls in
   Discord/Reddit.
4. **Local-first, hosting-ready.** SQLite and a single process today; the data model and config never assume
   a single user or a single machine.

## Constraints and known facts (research, 2026-09-05)

- **PCPartPicker:** no public API (staff: the internal one isn't going public); CSV export is a years-old
  feature request; it *does* store "what I paid" via Configure Part Price → Mark As Purchased. Unofficial scrapers
  exist (several GitHub repos, an Apify actor) — fragile and ToS-grey; **not a dependency** for v1.
- **Price sources:** Best Buy Products API (free key, near-real-time new-retail pricing, 1M+ SKUs);
  Keepa API (Amazon price history, ~€49/mo, no free tier); eBay sold comps (the honest used-market number —
  behind a login since 2026-07 and an approval-gated API). ⇒ a **pluggable provider interface** with Best Buy
  first, and our own `price_history` from day one.
- **Capture paths:** Windows CIM/WMI (`Win32_Processor`, `Win32_VideoController`, `Win32_PhysicalMemory`,
  `MSFT_PhysicalDisk`, `Win32_BaseBoard`) → model + serial for every installed part; order-history exports
  (Amazon "Request My Data", Newegg order history) → item, date, price paid; UPC barcode → shelf parts.
- **Environment:** Windows 11 dev box; Austin's existing stacks are .NET and Kubernetes/Helm; all git work on
  feature branches; manual test guide before any PR.

## Non-goals (v1)

- Compatibility checking (socket/fit/power) — PCPartPicker's other strength; revisit after M2.
- Multi-user auth and accounts — later; the schema must not preclude them (every root row carries an owner id).
- Scraping PCPartPicker.
- Mobile app — the share page and barcode capture are responsive web.

## What "done" looks like (milestone sketch — the architect refines each into a wave plan)

| Milestone | Outcome |
|---|---|
| **M0 Seed** | Stack chosen (ADR-0001); schema; the PowerShell scan importer puts real parts from Austin's machines into the DB; a build page; a share URL; one pricing provider (Best Buy) fetching and recording a quote; build/test/harness gates proven end to end. |
| **M1 Capture + delta** | Order-history import (Amazon, Newegg) sets cost basis; barcode + manual fallback; scheduled price refresh with history; paid-vs-now view per part and per build. |
| **M2 Share** | Public read-only build page polish (OG unfurl, no-JS render); exports (Markdown table, PNG, JSON); hosting-ready config (Postgres option, container image, auth seam). |

## Open decisions (Architect → Austin, 2026-09-05)

- **ADR-0001 Stack** — options presented in the kickoff turn.
- **Share model for local-first** — options presented in the kickoff turn.
- **Process:** PM writes briefs + validates + integrates the wave (assumed) vs. validates only.
