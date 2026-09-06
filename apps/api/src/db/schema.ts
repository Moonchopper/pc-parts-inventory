import {
  BUILD_SOURCES,
  CATEGORIES,
  CONDITIONS,
  IMPORT_KINDS,
  IMPORT_STATUSES,
  JOB_STATUSES,
  PART_STATUSES,
  QUOTE_KINDS,
  VISIBILITIES,
} from '@pcpi/contracts';
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * M0-seed.md §3, verbatim — one schema, sqlite dialect now, postgres later (ADR-0001). Column names
 * are snake_case in SQLite; the JS-side field names below (camelCase) are what Drizzle exposes.
 *
 * SQLite unique-index note: SQL NULLs are never equal to each other in a UNIQUE index, so a plain
 * `unique(ownerId, partNumber)` already means "unique among rows where partNumber IS NOT NULL" —
 * no partial index needed for the §3 `partNumber`/`upc` uniqueness rules.
 */

const now = sql`(current_timestamp)`;

export const owners = sqliteTable('owners', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(now),
});

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owners.id),
    category: text('category', { enum: CATEGORIES }).notNull(),
    manufacturer: text('manufacturer').notNull(),
    model: text('model').notNull(),
    partNumber: text('part_number'),
    upc: text('upc'),
    specs: text('specs', { mode: 'json' }).notNull().$type<Record<string, unknown>>(),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('products_owner_part_number_unique').on(t.ownerId, t.partNumber),
    uniqueIndex('products_owner_upc_unique').on(t.ownerId, t.upc),
    index('products_owner_category_idx').on(t.ownerId, t.category),
  ],
);

export const imports = sqliteTable('imports', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => owners.id),
  kind: text('kind', { enum: IMPORT_KINDS }).notNull(),
  source: text('source').notNull(),
  payloadHash: text('payload_hash').notNull().unique(),
  payload: text('payload', { mode: 'json' }).notNull().$type<unknown>(),
  status: text('status', { enum: IMPORT_STATUSES }).notNull().default('received'),
  summary: text('summary', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  receivedAt: text('received_at').notNull().default(now),
  processedAt: text('processed_at'),
});

export const parts = sqliteTable(
  'parts',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => owners.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    serial: text('serial'),
    condition: text('condition', { enum: CONDITIONS }).notNull().default('used'),
    quantity: integer('quantity').notNull().default(1),
    status: text('status', { enum: PART_STATUSES }).notNull().default('on_shelf'),
    acquiredAt: text('acquired_at'),
    acquiredPriceCents: integer('acquired_price_cents'),
    acquiredCurrency: text('acquired_currency').notNull().default('USD'),
    acquiredSource: text('acquired_source'),
    soldAt: text('sold_at'),
    soldPriceCents: integer('sold_price_cents'),
    importId: text('import_id').references(() => imports.id),
    identityKey: text('identity_key').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('parts_owner_identity_unique').on(t.ownerId, t.identityKey),
    index('parts_owner_status_idx').on(t.ownerId, t.status),
    index('parts_product_idx').on(t.productId),
  ],
);

export const builds = sqliteTable('builds', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => owners.id),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  source: text('source', { enum: BUILD_SOURCES }).notNull(),
  hostname: text('hostname'),
  visibility: text('visibility', { enum: VISIBILITIES }).notNull().default('unlisted'),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

export const buildItems = sqliteTable(
  'build_items',
  {
    buildId: text('build_id')
      .notNull()
      .references(() => builds.id),
    // A part is in at most one build, ever.
    partId: text('part_id')
      .notNull()
      .references(() => parts.id)
      .unique(),
    slot: text('slot'),
    addedAt: text('added_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.buildId, t.partId] })],
);

export const providerLinks = sqliteTable(
  'provider_links',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    url: text('url'),
    confidence: real('confidence').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('provider_links_unique').on(t.productId, t.provider, t.externalId)],
);

export const priceQuotes = sqliteTable(
  'price_quotes',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    providerLinkId: text('provider_link_id').references(() => providerLinks.id),
    provider: text('provider').notNull(),
    kind: text('kind', { enum: QUOTE_KINDS }).notNull(),
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    observedAt: text('observed_at').notNull(),
    sourceUrl: text('source_url'),
    raw: text('raw', { mode: 'json' }).$type<unknown>(),
  },
  (t) => [index('price_quotes_product_observed_idx').on(t.productId, t.observedAt)],
);

// D3 correction (architect-directed, brief "PM addendum 2"): §3 originally omitted `ownerId` on
// `jobs`, contradicting D3's "every root table" rule. Every enqueued job carries the owner of the
// thing it acts on (for `price_refresh`, the product's `ownerId`); the runner does NOT filter by
// owner in M0 (D3 v1 has exactly one owner) — the column exists so multi-tenancy stays additive.
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => owners.id),
  kind: text('kind').notNull(),
  runAt: text('run_at').notNull(),
  status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  lastError: text('last_error'),
});
