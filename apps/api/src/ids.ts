import { customAlphabet, nanoid } from 'nanoid';

// RFC 4648 base32 alphabet, lowercased (D7).
const BASE32_LOWER = 'abcdefghijklmnopqrstuvwxyz234567';
const slugAlphabet = customAlphabet(BASE32_LOWER, 10);

/** D7 — 10-char lowercase base32 slug, user-overridable, globally unique. */
export function generateSlug(): string {
  return slugAlphabet();
}

export function generateId(prefix: string): string {
  return `${prefix}_${nanoid(16)}`;
}
