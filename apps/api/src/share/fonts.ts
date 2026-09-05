import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `apps/api/assets/` sits one level up from both `src/share/` (dev, via tsx) and `dist/share/`
 * (built) — so this relative path resolves correctly either way. Never `process.cwd()` (the
 * harness and tests may run from a different working directory).
 */
const here = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(here, '..', '..', 'assets');

export type CardFont = {
  name: 'Inter';
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
};

let cached: CardFont[] | undefined;

/**
 * Loaded once at module scope (a lazy singleton) per the brief: a cold `readFileSync` on every
 * request would be the slowest part of rendering the card.
 */
export function loadCardFonts(): CardFont[] {
  if (!cached) {
    cached = [
      {
        name: 'Inter',
        data: readFileSync(resolve(ASSETS_DIR, 'inter-latin-400-normal.woff')),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: readFileSync(resolve(ASSETS_DIR, 'inter-latin-700-normal.woff')),
        weight: 700,
        style: 'normal',
      },
    ];
  }
  return cached;
}
