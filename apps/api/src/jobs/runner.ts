import type { PricingProvider } from '@pcpi/core';
import { and, asc, eq, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { jobs, priceQuotes, products, providerLinks } from '../db/schema.js';
import { generateId } from '../ids.js';
import { getActiveProviders } from '../pricing/registry.js';

export type JobKind = 'price_refresh' | 'import_process';
type JobRow = typeof jobs.$inferSelect;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * D10 — every job carries the `ownerId` of the thing it acts on (D3 correction, "PM addendum 2").
 * `runAt` defaults to now (immediately due). No filtering by owner happens anywhere in this module
 * yet (M0 has exactly one owner) — the column exists purely so multi-tenancy stays additive later.
 */
export function enqueueJob(
  kind: JobKind,
  ownerId: string,
  payload: Record<string, unknown>,
  runAt: string = nowIso(),
): string {
  const id = generateId('job');
  getDb()
    .insert(jobs)
    .values({ id, ownerId, kind, runAt, status: 'queued', attempts: 0, payload })
    .run();
  return id;
}

/** Claims the single oldest due job, atomically, so concurrent callers never double-claim under SQLite. */
function claimNextJob(): JobRow | null {
  return getDb().transaction((tx) => {
    const now = nowIso();
    const candidate = tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'queued'), lte(jobs.runAt, now)))
      .orderBy(asc(jobs.runAt), asc(jobs.id))
      .limit(1)
      .get();
    if (!candidate) return null;

    const attempts = candidate.attempts + 1;
    tx.update(jobs).set({ status: 'running', attempts }).where(eq(jobs.id, candidate.id)).run();
    return { ...candidate, status: 'running', attempts };
  });
}

function markDone(id: string): void {
  getDb().update(jobs).set({ status: 'done' }).where(eq(jobs.id, id)).run();
}

function markFailed(id: string, error: string): void {
  getDb().update(jobs).set({ status: 'failed', lastError: error }).where(eq(jobs.id, id)).run();
}

/** D11 gate, verbatim: a link is quotable when verified, or its match confidence is >= 0.9. */
function passesGate(link: { verified: boolean; confidence: number }): boolean {
  return link.verified || link.confidence >= 0.9;
}

/**
 * D11's `price_refresh`: for every active provider (registry, `PRICING_PROVIDERS`) that does not
 * yet have a link to this product, `search()` and store the best match as a new, unverified
 * `provider_link` (never touching an existing one — verified or not). Then, for every (existing or
 * just-created) link that passes the D11 gate, `quote()` and append one row to `price_quotes`
 * (D5 — append-only, never `UPDATE`/`DELETE`).
 */
async function runPriceRefresh(job: JobRow): Promise<{ detail: string; quotesAdded: number }> {
  const db = getDb();
  const payload = (job.payload ?? {}) as { productId?: string };
  const productId = payload.productId;
  if (!productId) throw new Error('price_refresh job payload is missing productId');

  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) throw new Error(`price_refresh: product ${productId} not found`);

  const activeProviders: PricingProvider[] = getActiveProviders();
  let quotesAdded = 0;

  for (const provider of activeProviders) {
    let link = db
      .select()
      .from(providerLinks)
      .where(and(eq(providerLinks.productId, product.id), eq(providerLinks.provider, provider.id)))
      .get();

    if (!link) {
      const results = await provider.search({
        category: product.category,
        manufacturer: product.manufacturer,
        model: product.model,
        ...(product.partNumber ? { partNumber: product.partNumber } : {}),
        ...(product.upc ? { upc: product.upc } : {}),
      });
      const best = [...results].sort((a, b) => b.confidence - a.confidence)[0];
      if (!best) continue;

      const linkId = generateId('link');
      db.insert(providerLinks)
        .values({
          id: linkId,
          productId: product.id,
          provider: provider.id,
          externalId: best.externalId,
          ...(best.url ? { url: best.url } : {}),
          confidence: best.confidence,
          verified: false,
          createdAt: nowIso(),
        })
        .run();
      link = db.select().from(providerLinks).where(eq(providerLinks.id, linkId)).get();
    }

    if (!link || !passesGate(link)) continue;

    const quoteResult = await provider.quote({ externalId: link.externalId });
    if (!quoteResult) continue;

    db.insert(priceQuotes)
      .values({
        id: generateId('quote'),
        productId: product.id,
        providerLinkId: link.id,
        provider: provider.id,
        kind: quoteResult.kind,
        priceCents: quoteResult.priceCents,
        currency: quoteResult.currency,
        observedAt: nowIso(),
        ...(quoteResult.sourceUrl ? { sourceUrl: quoteResult.sourceUrl } : {}),
        ...(quoteResult.raw !== undefined ? { raw: quoteResult.raw } : {}),
      })
      .run();
    quotesAdded += 1;
  }

  return {
    detail: `price_refresh product=${productId}: ${activeProviders.length} active provider(s), quotesAdded=${quotesAdded}`,
    quotesAdded,
  };
}

/**
 * M0 pass-through (brief Deliverable 2): `apps/api/src/imports/routes.ts` already processes scans
 * synchronously on `POST /imports/scans`. This kind exists in the schema/D10 for a future async
 * importer (M1, e.g. order-history CSV) — claiming and marking a job of this kind `done` without
 * doing any work is the documented M0 behaviour, not a placeholder bug.
 */
function runImportProcess(_job: JobRow): { detail: string } {
  return { detail: 'import_process: no-op pass-through (M0)' };
}

export type JobResult = { id: string; kind: string; status: 'done' | 'failed'; detail: string };

async function runOne(job: JobRow): Promise<JobResult> {
  try {
    const result =
      job.kind === 'price_refresh' ? await runPriceRefresh(job) : runImportProcess(job);
    markDone(job.id);
    return { id: job.id, kind: job.kind, status: 'done', detail: result.detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markFailed(job.id, message);
    return { id: job.id, kind: job.kind, status: 'failed', detail: message };
  }
}

/** D10 — runs every currently-due job to completion, once. Shared by `POST /jobs/run-due` and the tick loop. */
export async function runDueJobs(): Promise<{ ran: number; results: JobResult[] }> {
  const results: JobResult[] = [];
  for (;;) {
    const job = claimNextJob();
    if (!job) break;
    results.push(await runOne(job));
  }
  return { ran: results.length, results };
}

const TICK_INTERVAL_MS = 30_000;
let tickHandle: NodeJS.Timeout | undefined;

/**
 * D10's 30 s tick loop. Disabled under `HARNESS=1` (the harness drives jobs deterministically via
 * `POST /jobs/run-due` instead) and under vitest (`process.env.VITEST`, set by vitest itself) so
 * every test file that loads the route/app graph doesn't also start a real background timer racing
 * its own in-memory DB. Idempotent — a second call is a no-op — and `.unref()`d so it never keeps
 * a process alive on its own.
 */
export function startTickLoopUnlessDisabled(): void {
  if (tickHandle) return;
  if (process.env.HARNESS === '1') return;
  if (process.env.VITEST) return;

  tickHandle = setInterval(() => {
    runDueJobs().catch((err) => {
      console.error('jobs tick loop failed:', err);
    });
  }, TICK_INTERVAL_MS);
  tickHandle.unref();
}
