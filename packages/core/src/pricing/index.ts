import type { QuoteKind } from '@pcpi/contracts';

export type { QuoteKind };

/** M0-seed.md §4 `PricingProvider`. Types only — providers (`fixture`, `bestbuy`) are W0.3. */
export type ProductIdentity = {
  category: string;
  manufacturer: string;
  model: string;
  partNumber?: string;
  upc?: string;
};

export type ProviderSearchResult = {
  externalId: string;
  url?: string;
  title: string;
  confidence: number;
};

export type ProviderQuoteResult = {
  kind: QuoteKind;
  priceCents: number;
  currency: string;
  sourceUrl?: string;
  raw?: unknown;
};

export interface PricingProvider {
  readonly id: string;
  readonly kinds: QuoteKind[];
  search(identity: ProductIdentity): Promise<ProviderSearchResult[]>;
  quote(link: { externalId: string }): Promise<ProviderQuoteResult | null>;
}
