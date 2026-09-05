import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { seedOwner } from './db/seed.js';

/**
 * The one real process entrypoint — used by `pnpm dev` and, as a child process, by the harness
 * (which sets `DATABASE_URL` to a fresh temp file and `PORT=0` before spawning this). Prints
 * `{"port": <n>}` once listening so a parent process reading stdout can find the ephemeral port.
 */
runMigrations();
seedOwner();

const app = createApp();
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(JSON.stringify({ port: info.port }));
});
