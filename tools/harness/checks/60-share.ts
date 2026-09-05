import { isPlaceholderSerial } from '@pcpi/core';
import type { HarnessCheck, Json } from '../types.js';

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

    // Derived from the fixture, not a hardcoded list: any component whose serial is real (not a
    // Windows-CIM placeholder like "Default string"/"None") must never appear in the public share
    // response — regardless of which fixture is in play.
    const realSerials = ctx.fixture.components
      .map((c) => c.serial)
      .filter((s): s is string => typeof s === 'string' && !isPlaceholderSerial(s));
    const leaks = realSerials.filter((s) => raw.includes(s));
    if (leaks.length > 0) {
      ctx.fail(`share JSON leaked serials: ${leaks.join(', ')}`);
    }

    ctx.counters.share.json.items = Array.isArray(body.items) ? body.items.length : 0;

    ctx.state.detail = `GET /share/${slug} -> 200, items=${ctx.counters.share.json.items}, all ${ctx.fixture.components.length} component models present, no serial leaks (checked ${realSerials.length} real serials)`;
  },
} satisfies HarnessCheck;
