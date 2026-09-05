import type { HarnessCheck, Json } from '../types.js';

const KNOWN_SERIALS = ['GPU-SN-0001', 'MEM-SN-AAA', 'MEM-SN-BBB', 'STORAGE-SN-0001'];

export default {
  id: 'share',
  async run(ctx) {
    const slug = ctx.state.slug as string | undefined;
    if (!slug) {
      ctx.fail('no slug in state (the builds check must run first)');
      return;
    }
    const res = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}`);
    if (res.status !== 200) {
      ctx.fail(`GET /share/${slug} returned ${res.status}, expected 200`);
      return;
    }
    const body: Json = await res.json();
    const raw = JSON.stringify(body);

    const missing = ctx.fixture.components.filter((c) => !raw.includes(c.model));
    if (missing.length > 0) {
      ctx.fail(`share JSON is missing model strings: ${missing.map((c) => c.model).join(', ')}`);
    }

    const leaks = KNOWN_SERIALS.filter((s) => raw.includes(s));
    if (leaks.length > 0) {
      ctx.fail(`share JSON leaked serials: ${leaks.join(', ')}`);
    }

    ctx.counters.share.json.items = Array.isArray(body.items) ? body.items.length : 0;

    ctx.state.detail = `GET /share/${slug} -> 200, items=${ctx.counters.share.json.items}, all ${ctx.fixture.components.length} component models present, no serial leaks`;
  },
} satisfies HarnessCheck;
