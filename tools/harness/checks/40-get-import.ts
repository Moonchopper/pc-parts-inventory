import type { HarnessCheck, Json } from '../types.js';

export default {
  id: 'get-import',
  async run(ctx) {
    const importId = ctx.state.importId as string | undefined;
    if (!importId) {
      ctx.fail('no importId in state (the import-scan check must run first)');
      return;
    }
    const res = await fetch(`${ctx.apiUrl}/api/v1/imports/${importId}`);
    if (res.status !== 200) {
      ctx.fail(`GET /imports/${importId} returned ${res.status}, expected 200`);
      return;
    }
    const body: Json = await res.json();
    if (body.id !== importId) {
      ctx.fail(`GET /imports/${importId} returned a different id: ${body.id}`);
      return;
    }
    ctx.state.detail = `GET /imports/${importId} -> 200, status=${body.status}`;
  },
} satisfies HarnessCheck;
