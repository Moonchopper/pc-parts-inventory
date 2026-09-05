import { afterEach, describe, expect, it } from 'vitest';
import { publicOrigin } from '../src/public-origin.js';

describe('publicOrigin — D16', () => {
  afterEach(() => {
    delete process.env.PUBLIC_ORIGIN;
  });

  it('falls back to the request origin (dev only) when PUBLIC_ORIGIN is unset', () => {
    delete process.env.PUBLIC_ORIGIN;
    expect(publicOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('falls back to the request origin when PUBLIC_ORIGIN is set to an empty string', () => {
    process.env.PUBLIC_ORIGIN = '';
    expect(publicOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('overrides the request origin when PUBLIC_ORIGIN is set — the Docker-internal-hostname fix (F10)', () => {
    process.env.PUBLIC_ORIGIN = 'http://localhost:5173';
    expect(publicOrigin('http://api:3000')).toBe('http://localhost:5173');
  });
});
