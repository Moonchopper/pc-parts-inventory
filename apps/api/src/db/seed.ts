import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { owners } from './schema.js';

/** D3 — v1 has exactly one owner, seeded idempotently at boot. */
export const LOCAL_OWNER_ID = 'local';

export function seedOwner(): void {
  const db = getDb();
  const existing = db.select().from(owners).where(eq(owners.id, LOCAL_OWNER_ID)).get();
  if (!existing) {
    db.insert(owners).values({ id: LOCAL_OWNER_ID, name: 'Local Owner' }).run();
  }
}
