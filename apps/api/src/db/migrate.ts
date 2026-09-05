import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './client.js';

// Works whether this file runs as src (tsx) or dist (tsc -b): both mirror the same
// apps/api/{src,dist}/db -> apps/api/drizzle relative shape.
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, '..', '..', 'drizzle');

export function runMigrations(): void {
  migrate(getDb(), { migrationsFolder });
}
