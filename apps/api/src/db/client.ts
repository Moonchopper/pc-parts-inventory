import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: Database.Database | undefined;
let db: Db | undefined;

/** `file:./data/pcpi.db` -> `./data/pcpi.db`; `:memory:` passes through. */
export function resolveDatabasePath(databaseUrl: string): string {
  if (databaseUrl === ':memory:') return databaseUrl;
  return databaseUrl.startsWith('file:') ? databaseUrl.slice('file:'.length) : databaseUrl;
}

/**
 * Lazy singleton: nothing touches disk at import time. That is what lets `pnpm gen` boot the app
 * (to read its route schemas for the OpenAPI document) without a real `DATABASE_URL`, and lets the
 * harness set `DATABASE_URL` via a child-process env var before this module's first real call.
 */
export function getDb(): Db {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL ?? 'file:./data/pcpi.db';
    const filePath = resolveDatabasePath(databaseUrl);
    if (filePath !== ':memory:') {
      mkdirSync(dirname(filePath), { recursive: true });
    }
    sqlite = new Database(filePath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
  }
  return db;
}

export function closeDb(): void {
  sqlite?.close();
  sqlite = undefined;
  db = undefined;
}
