import type { ScanPayload } from '@pcpi/contracts';

/**
 * HTTP JSON response bodies are inherently dynamic here (the harness talks to the API over the
 * wire, the same way a real client would) — checks narrow what they need per field instead of
 * carrying a parallel copy of every DTO type.
 */
// biome-ignore lint/suspicious/noExplicitAny: see comment above
export type Json = any;

/**
 * Seam 3 (2026-09-05-m0-seed-workspace-api brief) — `artifacts/harness/<name>/report.json`'s exact
 * shape. Keys a given brief cannot fill yet keep their stated zero value, not `undefined` — later
 * briefs (noted per field) fill them in and the PM's integration gate asserts on them.
 */
export type Counters = {
  importsIdempotent: boolean; // W0.1
  productsCreated: number; // W0.1
  productsUpdated: number; // W0.1
  partsCreated: number; // W0.1
  partsUpdated: number; // W0.1
  partsShelved: number; // W0.1
  buildsCreated: number; // W0.1
  quotesRecorded: number; // W0.3
  valuation: { acquiredCents: number; currentCents: number; deltaCents: number }; // W0.3
  share: {
    json: { items: number }; // W0.1
    html: { ogTags: number; bytes: number }; // W0.4
    md: { rows: number; bytes: number }; // W0.5
  };
  card: { bytes: number }; // W0.5
};

export function defaultCounters(): Counters {
  return {
    importsIdempotent: false,
    productsCreated: 0,
    productsUpdated: 0,
    partsCreated: 0,
    partsUpdated: 0,
    partsShelved: 0,
    buildsCreated: 0,
    quotesRecorded: 0,
    valuation: { acquiredCents: 0, currentCents: 0, deltaCents: 0 },
    share: { json: { items: 0 }, html: { ogTags: 0, bytes: 0 }, md: { rows: 0, bytes: 0 } },
    card: { bytes: 0 },
  };
}

/**
 * Seam 2 — every check is a module in `tools/harness/checks/*.ts`, discovered by reading the
 * directory (sorted by filename — prefixed `10-`, `20-`, … for order).
 *
 * Convention (not part of the strict Seam 2 field list, so it rides on `state` rather than growing
 * the ctx type): a check that wants its `report.json` `checks[].detail` to say something on success
 * sets `ctx.state.detail = '…'` right before returning; the runner reads and clears that key after
 * each check so it never leaks into the next one's report row.
 */
export type HarnessCtx = {
  apiUrl: string; // http://127.0.0.1:<ephemeral>
  webUrl?: string; // set by the web check (W0.4) for later checks; undefined until then
  artifactsDir: string; // artifacts/harness/<name>
  fixture: ScanPayload; // the scan that was imported
  state: Record<string, unknown>; // cross-check scratch: importId, buildId, slug, productIds
  counters: Counters; // mutate in place
  fail(msg: string): void; // records an error and marks the run not-ok
};

export type HarnessCheck = { id: string; run(ctx: HarnessCtx): Promise<void> };
