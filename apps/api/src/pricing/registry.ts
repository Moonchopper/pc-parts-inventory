import type { PricingProvider, QuoteKind } from '@pcpi/core';
import { BestBuyProvider, FixtureProvider } from '@pcpi/core';

const KNOWN_PROVIDER_IDS = ['fixture', 'bestbuy'] as const;
const DEFAULT_ACTIVE_PROVIDERS = ['fixture'];

let fixtureProvider: FixtureProvider | undefined;
function getFixtureProvider(): FixtureProvider {
  fixtureProvider ??= new FixtureProvider();
  return fixtureProvider;
}

let bestBuyProvider: BestBuyProvider | undefined;
function getBestBuyProvider(): BestBuyProvider {
  const apiKey = process.env.BESTBUY_API_KEY;
  bestBuyProvider ??= new BestBuyProvider(apiKey ? { apiKey } : {});
  return bestBuyProvider;
}

function providerById(id: (typeof KNOWN_PROVIDER_IDS)[number]): PricingProvider {
  return id === 'fixture' ? getFixtureProvider() : getBestBuyProvider();
}

export type ProviderInfo = { id: string; kinds: QuoteKind[]; configured: boolean };

/**
 * `GET /providers` — every provider M0 knows about, regardless of whether `PRICING_PROVIDERS`
 * activates it for the refresh job (Recon: `bestbuy` always appears here, `configured: false` when
 * `BESTBUY_API_KEY` is unset — the normal state on this machine and in CI).
 */
export function listAllProviders(): ProviderInfo[] {
  return KNOWN_PROVIDER_IDS.map((id) => {
    const provider = providerById(id);
    return {
      id: provider.id,
      kinds: provider.kinds,
      configured: id === 'fixture' ? true : Boolean(process.env.BESTBUY_API_KEY),
    };
  });
}

function activeProviderIds(): string[] {
  const raw = process.env.PRICING_PROVIDERS;
  if (!raw || raw.trim() === '') return DEFAULT_ACTIVE_PROVIDERS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Providers the `price_refresh` job is allowed to call this run — `PRICING_PROVIDERS` (default
 * `fixture`), not each provider's own `configured` flag. An active-but-unconfigured provider (e.g.
 * `bestbuy` listed without `BESTBUY_API_KEY`) still degrades to `[]`/`null` on its own rather than
 * being filtered out here, matching its documented graceful-degradation behaviour.
 */
export function getActiveProviders(): PricingProvider[] {
  const ids = activeProviderIds();
  return ids
    .filter((id): id is (typeof KNOWN_PROVIDER_IDS)[number] =>
      (KNOWN_PROVIDER_IDS as readonly string[]).includes(id),
    )
    .map(providerById);
}
