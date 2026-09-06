import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiError, ScanPayload, SharedBuild } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../fixtures/scan.sample.json');

describe('ScanPayload', () => {
  it('parses the hand-written sample fixture', () => {
    const raw = JSON.parse(readFileSync(fixturePath, 'utf-8'));
    const result = ScanPayload.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('rejects a component missing a required field', () => {
    const result = ScanPayload.safeParse({
      schemaVersion: 1,
      scanner: { name: 'x', version: '1', os: 'windows' },
      host: { hostname: 'H', scannedAt: '2026-01-01T00:00:00Z' },
      components: [{ category: 'cpu', manufacturer: 'AMD', specs: {} }],
    });
    expect(result.success).toBe(false);
  });

  it('treats a null serial as valid (Recon gotcha 5 upstream contract)', () => {
    const result = ScanPayload.safeParse({
      schemaVersion: 1,
      scanner: { name: 'x', version: '1', os: 'windows' },
      host: { hostname: 'H', scannedAt: '2026-01-01T00:00:00Z' },
      components: [
        { category: 'psu', manufacturer: 'Corsair', model: 'RM850x', serial: null, specs: {} },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('ApiError', () => {
  it('accepts the §4 error shape with and without details', () => {
    expect(ApiError.safeParse({ error: { code: 'not_found', message: 'nope' } }).success).toBe(
      true,
    );
    expect(
      ApiError.safeParse({ error: { code: 'bad', message: 'm', details: { any: 'thing' } } })
        .success,
    ).toBe(true);
  });

  it('rejects a response missing the error envelope', () => {
    expect(ApiError.safeParse({ code: 'not_found', message: 'nope' }).success).toBe(false);
  });
});

describe('SharedBuild — currency (architect, 2026-09-05)', () => {
  function validSharedBuild(overrides: Record<string, unknown> = {}) {
    return {
      slug: 'abc123defg',
      name: 'MOONPC',
      updatedAt: '2026-09-01T00:00:00.000Z',
      currency: 'USD',
      items: [],
      ...overrides,
    };
  }

  it('accepts a payload with a currency string', () => {
    expect(SharedBuild.safeParse(validSharedBuild()).success).toBe(true);
  });

  it('rejects a payload with no currency at all — a required field, not an optional one', () => {
    const { currency: _currency, ...withoutCurrency } = validSharedBuild();
    const result = SharedBuild.safeParse(withoutCurrency);
    expect(result.success).toBe(false);
  });

  it('rejects an empty-string currency', () => {
    expect(SharedBuild.safeParse(validSharedBuild({ currency: '' })).success).toBe(false);
  });

  it('accepts a non-USD ISO-4217 currency (no per-currency special-casing in the schema)', () => {
    expect(SharedBuild.safeParse(validSharedBuild({ currency: 'EUR' })).success).toBe(true);
  });
});
