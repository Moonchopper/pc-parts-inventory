import { defineConfig } from 'drizzle-kit';

/** `pnpm --filter @pcpi/api db:generate` — checked-in SQL migrations live in ./drizzle. */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: 'file:./data/dev.db' },
});
