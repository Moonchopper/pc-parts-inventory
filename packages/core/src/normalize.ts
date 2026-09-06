import type { ScanComponent, ScanPayload } from '@pcpi/contracts';
import type { NormalizedPart, NormalizedProduct, NormalizeScanResult } from './types.js';

/**
 * D8 identity key: `serial` when present and not a placeholder, else
 * `${category}|${manufacturer}|${model}|${slot ?? ''}`.
 *
 * Windows CIM reports missing serials as one of a handful of placeholder strings rather than an
 * absent value (verified on Austin's box — seed brief Recon gotcha 5). Treat all of them, plus an
 * actually-empty string, the same as "no serial".
 */
const PLACEHOLDER_SERIALS = new Set([
  'default string',
  'to be filled by o.e.m.',
  'none',
  'system serial number',
  '',
]);

export function isPlaceholderSerial(serial: string | null | undefined): boolean {
  if (serial == null) return true;
  return PLACEHOLDER_SERIALS.has(serial.trim().toLowerCase());
}

function cleanSerial(serial: string | null | undefined): string | null {
  if (isPlaceholderSerial(serial)) return null;
  return (serial as string).trim();
}

function identityKeyFor(component: ScanComponent): string {
  const serial = cleanSerial(component.serial);
  if (serial) return serial;
  return `${component.category}|${component.manufacturer}|${component.model}|${component.slot ?? ''}`;
}

/** Product identity = (category, manufacturer, model, partNumber?) — deliberately ignores serial. */
function productKeyFor(component: ScanComponent): string {
  return `${component.category}|${component.manufacturer}|${component.model}|${component.partNumber ?? ''}`;
}

/**
 * D8 — pure, no I/O, no DB. Two identical memory sticks with different serials collapse to one
 * product / two parts because `productKeyFor` ignores serial while `identityKeyFor` does not.
 */
export function normalizeScan(payload: ScanPayload): NormalizeScanResult {
  const productsByKey = new Map<string, NormalizedProduct>();
  const parts: NormalizedPart[] = [];
  const identityKeys: string[] = [];

  for (const component of payload.components) {
    const productKey = productKeyFor(component);
    if (!productsByKey.has(productKey)) {
      productsByKey.set(productKey, {
        productKey,
        category: component.category,
        manufacturer: component.manufacturer,
        model: component.model,
        partNumber: component.partNumber ?? null,
        specs: component.specs,
      });
    }

    const identityKey = identityKeyFor(component);
    identityKeys.push(identityKey);
    parts.push({
      productKey,
      identityKey,
      serial: cleanSerial(component.serial),
      slot: component.slot ?? null,
      quantity: component.quantity,
    });
  }

  return { products: [...productsByKey.values()], parts, identityKeys };
}
