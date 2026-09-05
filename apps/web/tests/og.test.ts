import { describe, expect, it } from 'vitest';
import { buildOgImageUrl, buildOgTags, buildShareUrl, resolveOrigin } from '../src/lib/og.js';

describe('resolveOrigin', () => {
  it('falls back to the request origin when PUBLIC_ORIGIN is unset', () => {
    expect(resolveOrigin('http://127.0.0.1:5173', undefined)).toBe('http://127.0.0.1:5173');
    expect(resolveOrigin('http://127.0.0.1:5173', '')).toBe('http://127.0.0.1:5173');
  });

  it('prefers PUBLIC_ORIGIN when set', () => {
    expect(resolveOrigin('http://127.0.0.1:5173', 'https://pcpi.example.com')).toBe(
      'https://pcpi.example.com',
    );
  });
});

describe('buildOgImageUrl / buildShareUrl', () => {
  it('builds an absolute card.png URL, stripping a trailing slash on the origin', () => {
    expect(buildOgImageUrl('http://127.0.0.1:5173/', 'abc1234567')).toBe(
      'http://127.0.0.1:5173/api/v1/share/abc1234567/card.png',
    );
  });

  it('encodes the slug', () => {
    expect(buildOgImageUrl('http://127.0.0.1:5173', 'a b')).toBe(
      'http://127.0.0.1:5173/api/v1/share/a%20b/card.png',
    );
  });

  it('builds the share page URL', () => {
    expect(buildShareUrl('http://127.0.0.1:5173', 'abc1234567')).toBe(
      'http://127.0.0.1:5173/b/abc1234567',
    );
  });
});

describe('buildOgTags', () => {
  const tags = buildOgTags({
    title: 'MOONPC',
    description: '9 items',
    imageUrl: 'http://127.0.0.1:5173/api/v1/share/abc1234567/card.png',
    pageUrl: 'http://127.0.0.1:5173/b/abc1234567',
  });

  it('emits exactly the four required property tags plus the twitter bonus', () => {
    const properties = tags.filter((t) => t.attr === 'property').map((t) => t.key);
    expect(properties).toEqual(['og:title', 'og:description', 'og:image', 'og:url']);
    expect(tags.find((t) => t.key === 'twitter:card')).toEqual({
      key: 'twitter:card',
      attr: 'name',
      content: 'summary_large_image',
    });
  });

  it('carries the given content through unchanged', () => {
    expect(tags.find((t) => t.key === 'og:title')?.content).toBe('MOONPC');
    expect(tags.find((t) => t.key === 'og:image')?.content).toBe(
      'http://127.0.0.1:5173/api/v1/share/abc1234567/card.png',
    );
  });
});
