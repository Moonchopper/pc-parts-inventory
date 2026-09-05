import type { PriceQuote, ProviderLink } from '@pcpi/contracts';
import type { priceQuotes, providerLinks } from '../db/schema.js';

/**
 * Same DB-row -> wire-DTO conversion pattern as `apps/api/src/dto.ts` (not extended here — that
 * file is outside this brief's Scope): `exactOptionalPropertyTypes` forbids assigning `undefined`
 * to a plain `field?: T`, so a DB `null` becomes an omitted key via conditional spread.
 */

type ProviderLinkRow = typeof providerLinks.$inferSelect;
type PriceQuoteRow = typeof priceQuotes.$inferSelect;

export function toProviderLinkDTO(row: ProviderLinkRow): ProviderLink {
  return {
    id: row.id,
    productId: row.productId,
    provider: row.provider,
    externalId: row.externalId,
    ...(row.url != null ? { url: row.url } : {}),
    confidence: row.confidence,
    verified: row.verified,
    createdAt: row.createdAt,
  };
}

export function toPriceQuoteDTO(row: PriceQuoteRow): PriceQuote {
  return {
    id: row.id,
    productId: row.productId,
    ...(row.providerLinkId != null ? { providerLinkId: row.providerLinkId } : {}),
    provider: row.provider,
    kind: row.kind,
    priceCents: row.priceCents,
    currency: row.currency,
    observedAt: row.observedAt,
    ...(row.sourceUrl != null ? { sourceUrl: row.sourceUrl } : {}),
    ...(row.raw !== undefined && row.raw !== null ? { raw: row.raw } : {}),
  };
}
