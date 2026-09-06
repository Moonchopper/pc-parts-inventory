import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BestBuyProvider } from '@pcpi/core';
import { describe, expect, it } from 'vitest';

/**
 * No network in any test (brief Non-goals): every case below injects `fetchImpl` and reads its
 * response body from a checked-in recording under `apps/api/test/recordings/bestbuy/*.json`
 * instead of calling `api.bestbuy.com`. `BestBuyProvider`'s real request URL shape (see its module
 * doc comment) is asserted directly on the URL the stub receives.
 */
const here = dirname(fileURLToPath(import.meta.url));
const recordingsDir = resolve(here, 'recordings', 'bestbuy');

function loadRecording(name: string): unknown {
  return JSON.parse(readFileSync(resolve(recordingsDir, `${name}.json`), 'utf-8'));
}

function jsonResponse(body: unknown, opts: { ok?: boolean; status?: number } = {}): Response {
  const ok = opts.ok ?? true;
  const status = opts.status ?? (ok ? 200 : 500);
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('BestBuyProvider (no live HTTP — fetchImpl is always injected)', () => {
  it('search() hits the documented request URL shape via the injected fetch', async () => {
    let capturedUrl: string | undefined;
    const stubFetch: typeof fetch = (async (url) => {
      capturedUrl = String(url);
      return jsonResponse(loadRecording('search-exact-match'));
    }) as typeof fetch;

    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    const results = await provider.search({
      category: 'cpu',
      manufacturer: 'AMD',
      model: 'Ryzen 7 9800X3D',
      partNumber: '100-100001514WOF',
    });

    expect(capturedUrl).toMatch(/^https:\/\/api\.bestbuy\.com\/v1\/products\(\(search=/);
    expect(capturedUrl).toContain('apiKey=test-key');
    expect(capturedUrl).toContain('format=json');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: '6602010',
      title: expect.stringContaining('9800X3D'),
    });
  });

  it('scores an exact modelNumber match >= 0.9 (D11 auto-verify threshold)', async () => {
    const stubFetch: typeof fetch = (async () =>
      jsonResponse(loadRecording('search-exact-match'))) as typeof fetch;
    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    const results = await provider.search({
      category: 'cpu',
      manufacturer: 'AMD',
      model: 'Ryzen 7 9800X3D',
      partNumber: '100-100001514WOF',
    });
    expect(results[0]?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('scores a fuzzy title-only match below the D11 auto-verify threshold', async () => {
    const stubFetch: typeof fetch = (async () =>
      jsonResponse(loadRecording('search-fuzzy-match'))) as typeof fetch;
    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    const results = await provider.search({
      category: 'storage',
      manufacturer: 'Crucial',
      model: 'T700 2TB',
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.confidence).toBeLessThan(0.9);
  });

  it('returns [] when the recording has no matching products', async () => {
    const stubFetch: typeof fetch = (async () =>
      jsonResponse(loadRecording('search-empty'))) as typeof fetch;
    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    const results = await provider.search({
      category: 'other',
      manufacturer: 'Nobody',
      model: 'Nothing',
    });
    expect(results).toEqual([]);
  });

  it('quote() hits products(sku=...) and parses salePrice via the D6 money parser', async () => {
    let capturedUrl: string | undefined;
    const stubFetch: typeof fetch = (async (url) => {
      capturedUrl = String(url);
      return jsonResponse(loadRecording('quote-by-sku'));
    }) as typeof fetch;

    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    const quote = await provider.quote({ externalId: '6602010' });

    expect(capturedUrl).toMatch(/^https:\/\/api\.bestbuy\.com\/v1\/products\(sku=6602010\)/);
    expect(quote).toMatchObject({ kind: 'new_retail', priceCents: 47999, currency: 'USD' });
    expect(quote?.sourceUrl).toContain('bestbuy.com');
  });

  it('degrades to [] on a non-2xx response (search)', async () => {
    const stubFetch: typeof fetch = (async () =>
      jsonResponse({}, { ok: false, status: 503 })) as typeof fetch;
    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    const results = await provider.search({
      category: 'cpu',
      manufacturer: 'AMD',
      model: 'Ryzen 7 9800X3D',
    });
    expect(results).toEqual([]);
  });

  it('degrades to null on a non-2xx response (quote)', async () => {
    const stubFetch: typeof fetch = (async () =>
      jsonResponse({}, { ok: false, status: 404 })) as typeof fetch;
    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    expect(await provider.quote({ externalId: 'unknown-sku' })).toBeNull();
  });

  it('degrades to [] / null on a network error or timeout', async () => {
    const stubFetch: typeof fetch = (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch;
    const provider = new BestBuyProvider({ apiKey: 'test-key', fetchImpl: stubFetch });
    expect(await provider.search({ category: 'cpu', manufacturer: 'AMD', model: 'x' })).toEqual([]);
    expect(await provider.quote({ externalId: 'x' })).toBeNull();
  });

  it('is unconfigured and never calls fetch when no apiKey is set (BESTBUY_API_KEY unset — normal on this machine and in CI)', async () => {
    let called = false;
    const stubFetch: typeof fetch = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch;
    const provider = new BestBuyProvider({ fetchImpl: stubFetch });

    expect(provider.configured).toBe(false);
    expect(await provider.search({ category: 'cpu', manufacturer: 'AMD', model: 'x' })).toEqual([]);
    expect(await provider.quote({ externalId: 'x' })).toBeNull();
    expect(called).toBe(false);
  });
});
