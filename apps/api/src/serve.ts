import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { INSTANCE_ID, verifyOwnListener } from './boot-check.js';
import { runMigrations } from './db/migrate.js';
import { seedOwner } from './db/seed.js';

/**
 * The one real process entrypoint — used by `pnpm dev` and, as a child process, by the harness
 * (which sets `DATABASE_URL` to a fresh temp file and `PORT=0` before spawning this). Prints
 * `{"port": <n>}` once listening so a parent process reading stdout can find the ephemeral port —
 * that line must stay first and unchanged, the harness parses it.
 */
runMigrations();
seedOwner();

const app = createApp();
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ port: info.port }));

  // F2 — self-check *after* the port line, never before/instead of it. On `ok: false` something
  // other than this process is answering `localhost` traffic on this port (the Windows footgun:
  // 127.0.0.1 and 0.0.0.0 sockets on the same port coexist, and the more specific one wins) — log
  // one loud line naming the port, what answered instead, and the netstat hint, then exit. On
  // `ok: true` stay silent (the common case must not add noise to every boot).
  void verifyOwnListener(info.port).then((result) => {
    if (!result.ok) {
      console.error(
        `FATAL: port ${info.port} is not answering as this process (instanceId ${INSTANCE_ID}) — ` +
          `${result.reason}. Check what's listening: netstat -ano | findstr :${info.port}`,
      );
      process.exit(1);
    }
  });
});
