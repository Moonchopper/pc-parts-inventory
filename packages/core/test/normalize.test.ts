import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScanPayload } from '@pcpi/contracts';
import { describe, expect, it } from 'vitest';
import { normalizeScan } from '../src/normalize.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../contracts/fixtures/scan.sample.json');
const raw = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const fixture = ScanPayload.parse(raw);

/**
 * State the numbers the fixture implies so this test and `pnpm harness` agree (M0-seed.md §6 W0.1).
 * scan.sample.json: cpu, gpu, memory x2 (same product, different serials), storage, motherboard
 * (placeholder serial), psu (placeholder serial) = 7 components, 6 products, 7 parts.
 */
const EXPECTED_COMPONENT_COUNT = 7;
const EXPECTED_PRODUCT_COUNT = 6;
const EXPECTED_PART_COUNT = 7;

describe('normalizeScan', () => {
  it('matches the fixture component count', () => {
    expect(fixture.components).toHaveLength(EXPECTED_COMPONENT_COUNT);
  });

  it('collapses two identical memory sticks with different serials into one product, two parts (D8)', () => {
    const result = normalizeScan(fixture);
    expect(result.products).toHaveLength(EXPECTED_PRODUCT_COUNT);
    expect(result.parts).toHaveLength(EXPECTED_PART_COUNT);

    const memoryProducts = result.products.filter((p) => p.category === 'memory');
    expect(memoryProducts).toHaveLength(1);
    const memoryProductKey = memoryProducts[0]?.productKey;
    const memoryParts = result.parts.filter((p) => p.productKey === memoryProductKey);
    expect(memoryParts).toHaveLength(2);
    expect(new Set(memoryParts.map((p) => p.identityKey)).size).toBe(2);
  });

  it('treats Windows CIM serial placeholders as no-serial (Recon gotcha 5)', () => {
    const result = normalizeScan(fixture);
    const motherboardProduct = result.products.find((p) => p.category === 'motherboard');
    const motherboardPart = result.parts.find(
      (p) => p.productKey === motherboardProduct?.productKey,
    );
    expect(motherboardPart?.serial).toBeNull();
    expect(motherboardPart?.identityKey).toBe('motherboard|ASUS|ROG STRIX B650E-F GAMING WIFI|');

    const psuProduct = result.products.find((p) => p.category === 'psu');
    const psuPart = result.parts.find((p) => p.productKey === psuProduct?.productKey);
    expect(psuPart?.serial).toBeNull();
  });

  it('keeps a real serial as the identity key', () => {
    const result = normalizeScan(fixture);
    const storagePart = result.parts.find((p) => p.serial === 'STORAGE-SN-0001');
    expect(storagePart?.identityKey).toBe('STORAGE-SN-0001');
  });

  it('produces one identity key per component', () => {
    const result = normalizeScan(fixture);
    expect(result.identityKeys).toHaveLength(EXPECTED_COMPONENT_COUNT);
  });
});
