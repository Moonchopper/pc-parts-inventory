import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  PricingProvider,
  ProductIdentity,
  ProviderQuoteResult,
  ProviderSearchResult,
  QuoteKind,
} from './index.js';
import { parsePriceToCents } from './money.js';

type FixtureEntry = {
  title: string;
  kind: QuoteKind;
  price: string | number;
  currency?: string;
  url?: string;
};

type FixtureData = {
  partNumbers: Record<string, FixtureEntry>;
  manufacturerModel: Record<string, FixtureEntry>;
};

const PART_NUMBER_PREFIX = 'pn:';
const MANUFACTURER_MODEL_PREFIX = 'mm:';

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function manufacturerModelKey(manufacturer: string, model: string): string {
  return `${normalizeKey(manufacturer)}|${normalizeKey(model)}`;
}

function defaultFixturePath(): string {
  // packages/core/src/pricing/fixture.ts -> packages/core/fixtures/quotes.json. Computed from
  // import.meta.url (not process.cwd()) so this resolves the same whether this module runs as
  // src (tsx/vitest) or dist (tsc -b output, which mirrors src/ one level under dist/).
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'quotes.json');
}

/**
 * M0-seed.md §4/D11 `fixture` provider. Reads `packages/core/fixtures/quotes.json` once at
 * construction — keyed by `partNumber` first, else `` `${manufacturer}|${model}` `` (both
 * case-insensitive and whitespace-normalised, per the brief's Recon). Deterministic and fully
 * offline: the only I/O is this one static file.
 */
export class FixtureProvider implements PricingProvider {
  readonly id = 'fixture';
  readonly kinds: QuoteKind[] = ['new_retail', 'used_market', 'msrp', 'manual'];

  private readonly data: FixtureData;

  constructor(fixturePath: string = defaultFixturePath()) {
    const raw = readFileSync(fixturePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FixtureData>;
    this.data = {
      partNumbers: parsed.partNumbers ?? {},
      manufacturerModel: parsed.manufacturerModel ?? {},
    };
  }

  private lookup(identity: ProductIdentity): { externalId: string; entry: FixtureEntry } | null {
    if (identity.partNumber) {
      const key = normalizeKey(identity.partNumber);
      const entry = this.data.partNumbers[key];
      if (entry) return { externalId: `${PART_NUMBER_PREFIX}${key}`, entry };
    }
    const mmKey = manufacturerModelKey(identity.manufacturer, identity.model);
    const entry = this.data.manufacturerModel[mmKey];
    if (entry) return { externalId: `${MANUFACTURER_MODEL_PREFIX}${mmKey}`, entry };
    return null;
  }

  private resolveExternalId(externalId: string): FixtureEntry | null {
    if (externalId.startsWith(PART_NUMBER_PREFIX)) {
      return this.data.partNumbers[externalId.slice(PART_NUMBER_PREFIX.length)] ?? null;
    }
    if (externalId.startsWith(MANUFACTURER_MODEL_PREFIX)) {
      return (
        this.data.manufacturerModel[externalId.slice(MANUFACTURER_MODEL_PREFIX.length)] ?? null
      );
    }
    return null;
  }

  // Not `async` on purpose: this is a synchronous in-memory lookup wrapped to match the shared
  // `PricingProvider` interface (which real, I/O-bound providers like `BestBuyProvider` need to be
  // `Promise`-returning for) without an unnecessary microtask hop through `async`/`await`.
  search(identity: ProductIdentity): Promise<ProviderSearchResult[]> {
    const match = this.lookup(identity);
    if (!match) return Promise.resolve([]);
    return Promise.resolve([
      {
        externalId: match.externalId,
        ...(match.entry.url ? { url: match.entry.url } : {}),
        title: match.entry.title,
        confidence: 1,
      },
    ]);
  }

  quote(link: { externalId: string }): Promise<ProviderQuoteResult | null> {
    const entry = this.resolveExternalId(link.externalId);
    if (!entry) return Promise.resolve(null);
    const priceCents = parsePriceToCents(entry.price);
    if (priceCents === null) return Promise.resolve(null);
    return Promise.resolve({
      kind: entry.kind,
      priceCents,
      currency: entry.currency ?? 'USD',
      ...(entry.url ? { sourceUrl: entry.url } : {}),
    });
  }
}
