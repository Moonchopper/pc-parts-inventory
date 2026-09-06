import type { HarnessCheck, Json } from '../types.js';

export default {
  id: 'health',
  async run(ctx) {
    const res = await fetch(`${ctx.apiUrl}/api/v1/health`);
    if (res.status !== 200) {
      ctx.fail(`GET /health returned ${res.status}, expected 200`);
      return;
    }
    const body: Json = await res.json();
    if (body.ok !== true || body.db !== 'sqlite') {
      ctx.fail(`unexpected /health body: ${JSON.stringify(body)}`);
      return;
    }
    ctx.state.detail = 'GET /health -> 200 { ok: true, db: "sqlite" }';
  },
} satisfies HarnessCheck;
