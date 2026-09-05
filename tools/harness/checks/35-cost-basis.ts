import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HarnessCheck, Json } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const costBasisPath = resolve(repoRoot, 'packages', 'contracts', 'fixtures', 'cost-basis.json');

/**
 * §7 integration gate, revised 2026-09-05 (architect, Task 6): before any share fetch — this check
 * runs before `40-web.ts`/`50-exports.ts`/`60-share.ts`, all of which fetch and (for `.md`/PNG)
 * persist the share exports as artifacts — PATCH real `acquiredPriceCents` onto >= 2 parts of the
 * imported build. Without this, the headline paid-vs-now numbers stay zero even after Task 4/7's
 * fix, because a freshly-imported scan never carries a cost basis (`ScanComponent` has no price
 * field) and the share artifacts would still show em-dashes.
 *
 * Keyed by D8 `identityKey` rather than `partId` so one fixture
 * (`packages/contracts/fixtures/cost-basis.json`) works for both the default `scan.sample.json`
 * fixture and the real `MOONPC.redacted.json` scan the PM's `--fixture` run uses. Keys that are not
 * present in the currently-imported fixture are silently skipped (by design — one file serves two
 * fixtures); fewer than 2 matches fails the check outright, so a silently-empty cost basis can
 * never pass this gate.
 */
export default {
  id: 'cost-basis',
  async run(ctx) {
    let raw: Record<string, number>;
    try {
      raw = JSON.parse(readFileSync(costBasisPath, 'utf-8')) as Record<string, number>;
    } catch (err) {
      ctx.fail(
        `could not read/parse ${costBasisPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const partsRes = await fetch(`${ctx.apiUrl}/api/v1/parts`);
    if (partsRes.status !== 200) {
      ctx.fail(`GET /parts returned ${partsRes.status}, expected 200`);
      return;
    }
    const parts: Json = await partsRes.json();
    if (!Array.isArray(parts) || parts.length === 0) {
      ctx.fail('GET /parts returned no parts to apply a cost basis onto');
      return;
    }

    const applied: string[] = [];
    for (const part of parts) {
      const cents = raw[part.identityKey];
      if (cents === undefined) continue;

      const patchRes = await fetch(`${ctx.apiUrl}/api/v1/parts/${part.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ acquiredPriceCents: cents }),
      });
      if (patchRes.status !== 200) {
        ctx.fail(
          `PATCH /parts/${part.id} (identityKey=${part.identityKey}) returned ${patchRes.status}, expected 200`,
        );
        return;
      }
      applied.push(`${part.identityKey}=${cents}`);
    }

    if (applied.length < 2) {
      ctx.fail(
        `cost-basis.json matched only ${applied.length} of ${parts.length} parts by identityKey — expected >= 2 ` +
          '(a silently-empty cost basis must never pass this gate)',
      );
      return;
    }

    ctx.state.detail = `matched and PATCHed ${applied.length} parts via cost-basis.json: ${applied.join(', ')}`;
  },
} satisfies HarnessCheck;
