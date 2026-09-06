/**
 * D6 — integer minor units only, never a float. Providers hand back prices as decimal strings
 * ("249.99") or, in fixture data, plain JSON numbers (249.99) — both are just text once you strip
 * the JSON encoding, and text is exactly what should be parsed. `Math.round(x * 100)` on either
 * form reintroduces the binary floating-point rounding error D6 exists to avoid (e.g. `29.99 * 100`
 * is `2998.9999999999995` in IEEE-754 double precision). This walks the decimal string digit by
 * digit with `BigInt` arithmetic instead, so there is no floating-point step at all.
 *
 * Returns `null` for a missing price (`null`/`undefined`) or anything that isn't a plain
 * non-negative decimal number once thousands separators are stripped — callers treat that as "no
 * usable price from this provider" (see `FixtureProvider.quote` / `BestBuyProvider.quote`).
 */
export function parsePriceToCents(price: string | number | null | undefined): number | null {
  if (price === null || price === undefined) return null;

  const raw = typeof price === 'number' ? String(price) : price;
  const cleaned = raw.replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const segments = cleaned.split('.');
  const wholeRaw = segments[0] ?? '';
  const fracRaw = segments[1] ?? '';
  const wholeCents = BigInt(wholeRaw === '' ? '0' : wholeRaw) * 100n;
  if (fracRaw.length === 0) return Number(wholeCents);

  // Round-half-up on the third fractional digit; anything past that isn't significant for
  // currency and is dropped after the rounding decision is made.
  const fracPadded = fracRaw.padEnd(3, '0');
  let fracCents = BigInt(fracPadded.slice(0, 2));
  if (Number(fracPadded[2]) >= 5) fracCents += 1n;

  return Number(wholeCents + fracCents);
}
