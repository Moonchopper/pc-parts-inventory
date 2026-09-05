import { Category } from './category.js';
import { z } from './z.js';

/**
 * M0-seed.md §4 — API DTOs (response shapes; request shapes are the same minus server fields).
 * Field names are verbatim from §3 (data model) / §4 (contracts) — do not rename.
 */

// Raw arrays are exported too (not just the zod enum) so `apps/api`'s Drizzle schema can build its
// `text(col, { enum: [...] })` columns from the exact same literals instead of a hand-duplicated
// copy that could drift.
export const CONDITIONS = ['new', 'used', 'refurbished', 'broken'] as const;
export const Condition = z.enum(CONDITIONS).openapi('Condition');
export type Condition = z.infer<typeof Condition>;

export const PART_STATUSES = ['in_build', 'on_shelf', 'sold', 'disposed'] as const;
export const PartStatus = z.enum(PART_STATUSES).openapi('PartStatus');
export type PartStatus = z.infer<typeof PartStatus>;

export const BUILD_SOURCES = ['scan', 'manual'] as const;
export const BuildSource = z.enum(BUILD_SOURCES).openapi('BuildSource');
export type BuildSource = z.infer<typeof BuildSource>;

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export const Visibility = z.enum(VISIBILITIES).openapi('Visibility');
export type Visibility = z.infer<typeof Visibility>;

export const QUOTE_KINDS = ['new_retail', 'used_market', 'msrp', 'manual'] as const;
export const QuoteKind = z.enum(QUOTE_KINDS).openapi('QuoteKind');
export type QuoteKind = z.infer<typeof QuoteKind>;

export const IMPORT_KINDS = ['scan', 'order_csv', 'manual'] as const;
export const ImportKind = z.enum(IMPORT_KINDS).openapi('ImportKind');
export type ImportKind = z.infer<typeof ImportKind>;

export const IMPORT_STATUSES = ['received', 'processed', 'failed'] as const;
export const ImportStatus = z.enum(IMPORT_STATUSES).openapi('ImportStatus');
export type ImportStatus = z.infer<typeof ImportStatus>;

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export const JobStatus = z.enum(JOB_STATUSES).openapi('JobStatus');
export type JobStatus = z.infer<typeof JobStatus>;

export const Owner = z
  .object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
  })
  .openapi('Owner');
export type Owner = z.infer<typeof Owner>;

export const Product = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    category: Category,
    manufacturer: z.string(),
    model: z.string(),
    partNumber: z.string().optional(),
    upc: z.string().optional(),
    specs: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Product');
export type Product = z.infer<typeof Product>;

export const Part = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    productId: z.string(),
    product: Product.optional(),
    serial: z.string().optional(),
    condition: Condition,
    quantity: z.number().int(),
    status: PartStatus,
    acquiredAt: z.string().optional(),
    acquiredPriceCents: z.number().int().optional(),
    acquiredCurrency: z.string(),
    acquiredSource: z.string().optional(),
    soldAt: z.string().optional(),
    soldPriceCents: z.number().int().optional(),
    importId: z.string().optional(),
    identityKey: z.string(),
    notes: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Part');
export type Part = z.infer<typeof Part>;

/**
 * Request schemas for the write endpoints (crud-endpoints brief, 2026-09-05) — derived from the
 * DTOs above minus server fields (`id`, `ownerId`, `createdAt`, `updatedAt`, computed `product`),
 * plus a few fields that stay server-managed even though they are columns: `identityKey` and
 * `importId` (owned by the scan importer, D8) on `Part`, and `slug`/`source` on `Build` (`slug` is
 * generated on create — D7 — and only made user-overridable on PATCH; `source` is fixed to
 * `'manual'` for API-created builds so only the scan importer can produce a `source: 'scan'` row).
 * PATCH variants are fully partial — an empty body is a valid no-op 200.
 */
export const PartCreate = z
  .object({
    productId: z.string(),
    serial: z.string().optional(),
    condition: Condition.optional(),
    quantity: z.number().int().optional(),
    status: PartStatus.optional(),
    acquiredAt: z.string().optional(),
    acquiredPriceCents: z.number().int().optional(),
    acquiredCurrency: z.string().optional(),
    acquiredSource: z.string().optional(),
    soldAt: z.string().optional(),
    soldPriceCents: z.number().int().optional(),
    notes: z.string().optional(),
  })
  .openapi('PartCreate');
export type PartCreate = z.infer<typeof PartCreate>;

export const PartPatch = z
  .object({
    serial: z.string().optional(),
    condition: Condition.optional(),
    quantity: z.number().int().optional(),
    status: PartStatus.optional(),
    acquiredAt: z.string().optional(),
    acquiredPriceCents: z.number().int().optional(),
    acquiredCurrency: z.string().optional(),
    acquiredSource: z.string().optional(),
    soldAt: z.string().optional(),
    soldPriceCents: z.number().int().optional(),
    notes: z.string().optional(),
  })
  .openapi('PartPatch');
export type PartPatch = z.infer<typeof PartPatch>;

export const BuildCreate = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    visibility: Visibility.optional(),
  })
  .openapi('BuildCreate');
export type BuildCreate = z.infer<typeof BuildCreate>;

export const BuildPatch = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    visibility: Visibility.optional(),
    slug: z.string().optional(),
  })
  .openapi('BuildPatch');
export type BuildPatch = z.infer<typeof BuildPatch>;

export const BuildItem = z
  .object({
    buildId: z.string(),
    partId: z.string(),
    slot: z.string().optional(),
    addedAt: z.string(),
  })
  .openapi('BuildItem');
export type BuildItem = z.infer<typeof BuildItem>;

export const BuildItemCreate = z
  .object({
    partId: z.string(),
    slot: z.string().optional(),
  })
  .openapi('BuildItemCreate');
export type BuildItemCreate = z.infer<typeof BuildItemCreate>;

export const BuildItemExpanded = BuildItem.extend({
  part: Part,
  product: Product,
}).openapi('BuildItemExpanded');
export type BuildItemExpanded = z.infer<typeof BuildItemExpanded>;

export const Build = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().optional(),
    source: BuildSource,
    hostname: z.string().optional(),
    visibility: Visibility,
    createdAt: z.string(),
    updatedAt: z.string(),
    items: z.array(BuildItemExpanded).optional(),
  })
  .openapi('Build');
export type Build = z.infer<typeof Build>;

export const ProviderLink = z
  .object({
    id: z.string(),
    productId: z.string(),
    provider: z.string(),
    externalId: z.string(),
    url: z.string().optional(),
    confidence: z.number(),
    verified: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('ProviderLink');
export type ProviderLink = z.infer<typeof ProviderLink>;

export const PriceQuote = z
  .object({
    id: z.string(),
    productId: z.string(),
    providerLinkId: z.string().optional(),
    provider: z.string(),
    kind: QuoteKind,
    priceCents: z.number().int(),
    currency: z.string(),
    observedAt: z.string(),
    sourceUrl: z.string().optional(),
    raw: z.unknown().optional(),
  })
  .openapi('PriceQuote');
export type PriceQuote = z.infer<typeof PriceQuote>;

export const ImportSummary = z
  .object({
    productsCreated: z.number().int(),
    productsUpdated: z.number().int(),
    partsCreated: z.number().int(),
    partsUpdated: z.number().int(),
    partsShelved: z.number().int(),
    buildId: z.string(),
  })
  .openapi('ImportSummary');
export type ImportSummary = z.infer<typeof ImportSummary>;

export const Import = z
  .object({
    id: z.string(),
    ownerId: z.string(),
    kind: ImportKind,
    source: z.string(),
    payloadHash: z.string(),
    payload: z.unknown(),
    status: ImportStatus,
    summary: ImportSummary.optional(),
    receivedAt: z.string(),
    processedAt: z.string().optional(),
  })
  .openapi('Import');
export type Import = z.infer<typeof Import>;

export const ValuationItem = z
  .object({
    partId: z.string(),
    quantity: z.number().int(),
    acquiredCents: z.number().int().optional(),
    currentCents: z.number().int().optional(),
    quote: z
      .object({
        kind: QuoteKind,
        provider: z.string(),
        observedAt: z.string(),
        ageDays: z.number().int(),
      })
      .optional(),
  })
  .openapi('ValuationItem');
export type ValuationItem = z.infer<typeof ValuationItem>;

/**
 * The like-for-like subset of a `Valuation`: items having *both* a cost basis and a quote.
 * `deltaCents === currentCents - acquiredCents` holds here and only here — the top-level
 * `Valuation.acquiredCents`/`currentCents` are sums over different (possibly non-overlapping) item
 * sets, so a delta over them would not be a delta (architect, 2026-09-05 — D5 no-fallback revision).
 */
export const ValuationComparable = z
  .object({
    items: z.number().int(),
    acquiredCents: z.number().int(),
    currentCents: z.number().int(),
    deltaCents: z.number().int(),
    // `null` rather than `0`/`NaN` when `acquiredCents` is 0 — "no comparable spend" and "no change"
    // are different facts (Task 7 presentation rule: never render a fake percent).
    deltaPct: z.number().nullable(),
  })
  .openapi('ValuationComparable');
export type ValuationComparable = z.infer<typeof ValuationComparable>;

export const ValuationCoverage = z
  .object({
    items: z.number().int(),
    withAcquired: z.number().int(),
    withCurrent: z.number().int(),
  })
  .openapi('ValuationCoverage');
export type ValuationCoverage = z.infer<typeof ValuationCoverage>;

export const Valuation = z
  .object({
    buildId: z.string(),
    currency: z.string(),
    acquiredCents: z.number().int(),
    currentCents: z.number().int(),
    comparable: ValuationComparable,
    coverage: ValuationCoverage,
    items: z.array(ValuationItem),
  })
  .openapi('Valuation');
export type Valuation = z.infer<typeof Valuation>;

export const SharedBuildItem = z
  .object({
    category: Category,
    manufacturer: z.string(),
    model: z.string(),
    quantity: z.number().int(),
    currentCents: z.number().int().optional(),
  })
  .openapi('SharedBuildItem');
export type SharedBuildItem = z.infer<typeof SharedBuildItem>;

export const SharedBuild = z
  .object({
    slug: z.string(),
    name: z.string(),
    description: z.string().optional(),
    updatedAt: z.string(),
    // Required (architect, 2026-09-05): governs every cents value in this response — every
    // `items[].currentCents` and all of `valuation.*` — resolved once, server-side (the owner's
    // default, `USD` in v1). No per-item currency; mixed-currency builds are a later ADR.
    currency: z.string().min(1),
    items: z.array(SharedBuildItem),
    // The ★ subset of `Valuation` (see above) — never `items`, never raw quotes.
    valuation: z
      .object({
        acquiredCents: z.number().int(),
        currentCents: z.number().int(),
        comparable: ValuationComparable,
        coverage: ValuationCoverage,
      })
      .optional(),
  })
  .openapi('SharedBuild');
export type SharedBuild = z.infer<typeof SharedBuild>;
