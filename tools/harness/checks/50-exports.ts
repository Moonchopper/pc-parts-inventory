import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HarnessCheck, Json } from '../types.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const KNOWN_SERIALS = ['GPU-SN-0001', 'MEM-SN-AAA', 'MEM-SN-BBB', 'STORAGE-SN-0001'];

/**
 * Counts Markdown table rows that describe an item — the header row, its `---` separator, and any
 * bolded `**Total …**` / `**Delta**` totals row are excluded, so this counts exactly the per-item
 * rows the §7 gate compares against the share JSON's `items.length`.
 */
function countMarkdownItemRows(md: string): number {
  let count = 0;
  let inTable = false;
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trim();
    if (line === '| Type | Item | Price |') {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|\s*-+\s*\|/.test(line)) continue; // header separator row
    if (line.includes('**')) continue; // bolded totals rows
    count++;
  }
  return count;
}

export default {
  id: 'exports',
  async run(ctx) {
    const slug = ctx.state.slug as string | undefined;
    if (!slug) {
      ctx.fail('no slug in state (the builds check must run first)');
      return;
    }

    const jsonRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}`);
    if (jsonRes.status !== 200) {
      ctx.fail(`GET /share/${slug} returned ${jsonRes.status}, expected 200`);
      return;
    }
    const shared: Json = await jsonRes.json();
    const expectedRows = Array.isArray(shared.items) ? shared.items.length : 0;

    // --- .md ---
    const mdRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}.md`);
    if (mdRes.status !== 200) {
      ctx.fail(`GET /share/${slug}.md returned ${mdRes.status}, expected 200`);
      return;
    }
    const md = await mdRes.text();
    const mdBytes = Buffer.byteLength(md, 'utf-8');
    const rows = countMarkdownItemRows(md);

    if (rows !== expectedRows) {
      ctx.fail(`share.md has ${rows} item rows, expected ${expectedRows} (share JSON items)`);
    }

    const missingModels = ctx.fixture.components.filter((c) => !md.includes(c.model));
    if (missingModels.length > 0) {
      ctx.fail(
        `share.md is missing model strings: ${missingModels.map((c) => c.model).join(', ')}`,
      );
    }

    const mdLeaks = KNOWN_SERIALS.filter((s) => md.includes(s));
    if (mdLeaks.length > 0) {
      ctx.fail(`share.md leaked serials: ${mdLeaks.join(', ')}`);
    }

    // F10/D16: the footer must point at the human page (`/b/{slug}`), never the API's own JSON
    // route or a Docker-internal hostname.
    if (!md.includes(`/b/${slug}`)) {
      ctx.fail(`share.md footer does not contain /b/${slug} (D16 violation)`);
    }
    if (md.includes('/api/v1/')) {
      ctx.fail('share.md footer contains an internal /api/v1/ URL (D16 violation)');
    }
    if (md.includes('api:')) {
      ctx.fail('share.md footer contains an internal "api:" hostname (D16 violation)');
    }

    ctx.counters.share.md.rows = rows;
    ctx.counters.share.md.bytes = mdBytes;
    writeFileSync(join(ctx.artifactsDir, 'share.md'), md, 'utf-8');

    // --- card.png ---
    const pngRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}/card.png`);
    if (pngRes.status !== 200) {
      ctx.fail(`GET /share/${slug}/card.png returned ${pngRes.status}, expected 200`);
      return;
    }
    const pngBuf = Buffer.from(await pngRes.arrayBuffer());

    if (!pngBuf.subarray(0, 8).equals(PNG_MAGIC)) {
      ctx.fail('card.png does not start with the PNG magic bytes');
    }
    if (pngBuf.length <= 10_000) {
      ctx.fail(`card.png is ${pngBuf.length} bytes, expected > 10000`);
    }

    ctx.counters.card.bytes = pngBuf.length;
    writeFileSync(join(ctx.artifactsDir, 'card.png'), pngBuf);

    // --- ETag / 304 (card.png only; the brief requires it, no counter owns it) ---
    const etag = pngRes.headers.get('etag');
    if (!etag) {
      ctx.fail('card.png response has no ETag header');
    } else {
      const conditionalRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}/card.png`, {
        headers: { 'if-none-match': etag },
      });
      if (conditionalRes.status !== 304) {
        ctx.fail(
          `GET card.png with a matching If-None-Match returned ${conditionalRes.status}, expected 304`,
        );
      }
    }

    ctx.state.detail =
      `GET /share/${slug}.md -> 200, rows=${rows} (items=${expectedRows}), bytes=${mdBytes}; ` +
      `GET /share/${slug}/card.png -> 200, bytes=${pngBuf.length}, PNG magic ok, ETag round-trips 304`;
  },
} satisfies HarnessCheck;
