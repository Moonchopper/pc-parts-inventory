import type {
  PricingProvider,
  ProductIdentity,
  ProviderQuoteResult,
  ProviderSearchResult,
  QuoteKind,
} from './index.js';
import { parsePriceToCents } from './money.js';

export type BestBuyProviderOptions = {
  /** `BESTBUY_API_KEY`. Unset means "not configured" — `search`/`quote` degrade to `[]`/`null`. */
  apiKey?: string;
  /** Injected for tests — the brief requires no live network calls in any test. */
  fetchImpl?: typeof fetch;
  /** Injected for tests; defaults to the real Best Buy Products API host. */
  baseUrl?: string;
  timeoutMs?: number;
};

type BestBuyProductJson = {
  sku?: number | string;
  name?: string;
  salePrice?: number;
  regularPrice?: number;
  manufacturer?: string;
  modelNumber?: string;
  upc?: string;
  url?: string;
};

type BestBuyProductsResponse = { products?: BestBuyProductJson[] };

const DEFAULT_BASE_URL = 'https://api.bestbuy.com/v1';
const DEFAULT_TIMEOUT_MS = 5_000;
const SHOW_FIELDS = 'sku,name,salePrice,regularPrice,manufacturer,modelNumber,upc,url';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Confidence per the brief's Recon: an exact `modelNumber`/`upc` match against the scanned
 * identity is >= 0.9 (D11's "high-confidence, no manual verification needed" threshold); anything
 * else falls back to a fuzzy title-contains-model check at a deliberately sub-0.9 score, so an
 * unverified fuzzy match never auto-qualifies for D11's refresh gate.
 */
function scoreConfidence(identity: ProductIdentity, item: BestBuyProductJson): number {
  if (
    identity.partNumber &&
    item.modelNumber &&
    normalize(identity.partNumber) === normalize(item.modelNumber)
  ) {
    return 0.95;
  }
  if (identity.upc && item.upc && identity.upc === item.upc) {
    return 0.95;
  }
  const title = normalize(item.name ?? '');
  const model = normalize(identity.model);
  if (model && title.includes(model)) {
    return 0.6;
  }
  return 0.3;
}

/**
 * M0-seed.md §4/D11 `bestbuy` provider. Real implementation against the Best Buy Products API
 * (request shapes recorded in the brief's Recon, 2026-09-05):
 *   search: `{baseUrl}/products((search=<term>))?apiKey=…&format=json&show=…&pageSize=10`
 *   quote:  `{baseUrl}/products(sku=<sku>)?apiKey=…&format=json&show=…`
 * Prices come back as decimal **dollars** (`salePrice: 249.99`), parsed with `parsePriceToCents`
 * (never `Math.round(x * 100)`) into `new_retail` quotes. Never called live in tests or the
 * harness (brief Non-goals) — `fetchImpl` is always injected there, and `apiKey` unset (the normal
 * state on this machine and in CI) makes both methods degrade to `[]`/`null` without a network call.
 */
export class BestBuyProvider implements PricingProvider {
  readonly id = 'bestbuy';
  readonly kinds: QuoteKind[] = ['new_retail'];

  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: BestBuyProviderOptions = {}) {
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(identity: ProductIdentity): Promise<ProviderSearchResult[]> {
    if (!this.apiKey) return [];
    const term = [identity.manufacturer, identity.model].filter(Boolean).join(' ');
    const url =
      `${this.baseUrl}/products((search=${encodeURIComponent(term)}))` +
      `?apiKey=${encodeURIComponent(this.apiKey)}&format=json&show=${SHOW_FIELDS}&pageSize=10`;

    const body = await this.getJson<BestBuyProductsResponse>(url);
    if (!body) return [];
    const items = Array.isArray(body.products) ? body.products : [];

    return items
      .filter((item): item is BestBuyProductJson & { sku: number | string } => item.sku != null)
      .map((item) => ({
        externalId: String(item.sku),
        ...(item.url ? { url: item.url } : {}),
        title: item.name ?? '',
        confidence: scoreConfidence(identity, item),
      }));
  }

  async quote(link: { externalId: string }): Promise<ProviderQuoteResult | null> {
    if (!this.apiKey) return null;
    const url =
      `${this.baseUrl}/products(sku=${encodeURIComponent(link.externalId)})` +
      `?apiKey=${encodeURIComponent(this.apiKey)}&format=json&show=${SHOW_FIELDS}`;

    const body = await this.getJson<BestBuyProductsResponse>(url);
    const item = body?.products?.[0];
    if (!item) return null;

    const priceCents = parsePriceToCents(item.salePrice ?? item.regularPrice ?? null);
    if (priceCents === null) return null;

    return {
      kind: 'new_retail',
      priceCents,
      currency: 'USD',
      ...(item.url ? { sourceUrl: item.url } : {}),
      raw: item,
    };
  }

  /** Graceful degradation to `null` on a non-2xx, a timeout, a network error, or unparsable JSON. */
  private async getJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { signal: controller.signal });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
