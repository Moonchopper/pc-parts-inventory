import type {
  Build,
  BuildItemExpanded,
  Import,
  ImportSummary,
  Owner,
  Part,
  Product,
} from '@pcpi/contracts';
import type { builds, imports, owners, parts, products } from './db/schema.js';

/**
 * DB rows use `null` for absent values; the wire DTOs use an absent key (`exactOptionalPropertyTypes`
 * forbids assigning `undefined` to a plain `field?: T`). These helpers do the one conversion in one
 * place instead of a conditional-spread scattered through every route.
 */

type OwnerRow = typeof owners.$inferSelect;
type ProductRow = typeof products.$inferSelect;
type PartRow = typeof parts.$inferSelect;
type BuildRow = typeof builds.$inferSelect;
type ImportRow = typeof imports.$inferSelect;

export function toOwnerDTO(row: OwnerRow): Owner {
  return { id: row.id, name: row.name, createdAt: row.createdAt };
}

export function toProductDTO(row: ProductRow): Product {
  return {
    id: row.id,
    ownerId: row.ownerId,
    category: row.category,
    manufacturer: row.manufacturer,
    model: row.model,
    ...(row.partNumber != null ? { partNumber: row.partNumber } : {}),
    ...(row.upc != null ? { upc: row.upc } : {}),
    specs: row.specs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPartDTO(row: PartRow, opts: { product?: Product } = {}): Part {
  return {
    id: row.id,
    ownerId: row.ownerId,
    productId: row.productId,
    ...(opts.product ? { product: opts.product } : {}),
    ...(row.serial != null ? { serial: row.serial } : {}),
    condition: row.condition,
    quantity: row.quantity,
    status: row.status,
    ...(row.acquiredAt != null ? { acquiredAt: row.acquiredAt } : {}),
    ...(row.acquiredPriceCents != null ? { acquiredPriceCents: row.acquiredPriceCents } : {}),
    acquiredCurrency: row.acquiredCurrency,
    ...(row.acquiredSource != null ? { acquiredSource: row.acquiredSource } : {}),
    ...(row.soldAt != null ? { soldAt: row.soldAt } : {}),
    ...(row.soldPriceCents != null ? { soldPriceCents: row.soldPriceCents } : {}),
    ...(row.importId != null ? { importId: row.importId } : {}),
    identityKey: row.identityKey,
    ...(row.notes != null ? { notes: row.notes } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toBuildDTO(row: BuildRow, opts: { items?: BuildItemExpanded[] } = {}): Build {
  return {
    id: row.id,
    ownerId: row.ownerId,
    slug: row.slug,
    name: row.name,
    ...(row.description != null ? { description: row.description } : {}),
    source: row.source,
    ...(row.hostname != null ? { hostname: row.hostname } : {}),
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(opts.items ? { items: opts.items } : {}),
  };
}

export function toImportDTO(row: ImportRow): Import {
  return {
    id: row.id,
    ownerId: row.ownerId,
    kind: row.kind,
    source: row.source,
    payloadHash: row.payloadHash,
    payload: row.payload,
    status: row.status,
    ...(row.summary != null ? { summary: row.summary as unknown as ImportSummary } : {}),
    receivedAt: row.receivedAt,
    ...(row.processedAt != null ? { processedAt: row.processedAt } : {}),
  };
}
