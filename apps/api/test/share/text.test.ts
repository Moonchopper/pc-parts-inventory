import { describe, expect, it } from 'vitest';
import { escapeMarkdownCell, truncate } from '../../src/share/text.js';

describe('escapeMarkdownCell', () => {
  it('escapes a literal pipe so it cannot break a table row', () => {
    expect(escapeMarkdownCell('Corsair | RM850x')).toBe('Corsair \\| RM850x');
  });

  it('collapses newlines (CRLF, LF, CR) to a single space', () => {
    expect(escapeMarkdownCell('line one\nline two')).toBe('line one line two');
    expect(escapeMarkdownCell('line one\r\nline two')).toBe('line one line two');
    expect(escapeMarkdownCell('line one\rline two')).toBe('line one line two');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeMarkdownCell('AMD Ryzen 7 9800X3D')).toBe('AMD Ryzen 7 9800X3D');
  });
});

describe('truncate', () => {
  it('leaves short strings alone', () => {
    expect(truncate('RTX 4070', 20)).toBe('RTX 4070');
  });

  it('cuts long strings and appends a single ellipsis, never exceeding maxChars', () => {
    const long = 'A'.repeat(100);
    const result = truncate(long, 40);
    expect(result.length).toBe(40);
    expect(result.endsWith('…')).toBe(true);
  });

  it('never overflows maxChars for a very long build name', () => {
    const veryLong =
      'My Extremely Overengineered Gaming and Streaming and Rendering Battlestation Build 2026';
    const result = truncate(veryLong, 40);
    expect(result.length).toBeLessThanOrEqual(40);
  });
});
