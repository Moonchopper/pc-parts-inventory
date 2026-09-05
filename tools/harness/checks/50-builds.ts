import type { HarnessCheck, Json } from '../types.js';

export default {
  id: 'builds',
  async run(ctx) {
    const listRes = await fetch(`${ctx.apiUrl}/api/v1/builds`);
    if (listRes.status !== 200) {
      ctx.fail(`GET /builds returned ${listRes.status}, expected 200`);
      return;
    }
    const list: Json = await listRes.json();
    ctx.counters.buildsCreated = list.length;
    if (list.length !== 1) {
      ctx.fail(`expected exactly 1 build (one hostname scanned), got ${list.length}`);
      return;
    }
    const build = list[0];
    ctx.state.buildId = build.id;
    ctx.state.slug = build.slug;

    const getRes = await fetch(`${ctx.apiUrl}/api/v1/builds/${build.id}`);
    if (getRes.status !== 200) {
      ctx.fail(`GET /builds/${build.id} returned ${getRes.status}, expected 200`);
      return;
    }
    const full: Json = await getRes.json();
    if (full.items?.length !== ctx.counters.partsCreated) {
      ctx.fail(`build has ${full.items?.length} items, expected ${ctx.counters.partsCreated}`);
      return;
    }

    ctx.state.detail = `GET /builds -> 1 build; GET /builds/${build.id} -> ${full.items.length} items, slug=${build.slug}`;
  },
} satisfies HarnessCheck;
