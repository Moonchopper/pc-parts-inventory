import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  ApiUnreachableError,
  apiUnreachableMessage,
  fetchWithTimeout,
} from '../src/lib/server/api.js';

/**
 * F2 — binds an ephemeral port, then closes it immediately, so a request against it gets a fast
 * `ECONNREFUSED` instead of tying up the suite waiting out `API_TIMEOUT_MS`. Never 3000/5173 (per
 * the brief: those belong to Austin's running stack and to this worktree's own dev servers).
 */
async function findClosedPort(): Promise<number> {
  const srv = createServer();
  const port = await new Promise<number>((resolvePort, reject) => {
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('could not read an ephemeral port'));
        return;
      }
      resolvePort(address.port);
    });
  });
  await new Promise<void>((resolveClose) => srv.close(() => resolveClose()));
  return port;
}

describe('apiUnreachableMessage', () => {
  it('names the URL that was tried', () => {
    expect(apiUnreachableMessage('http://localhost:3000')).toContain('http://localhost:3000');
  });

  it('asks whether the API is running', () => {
    expect(apiUnreachableMessage('http://localhost:3000')).toMatch(/is it running\??/i);
  });

  it('mentions the netstat port-squatting hint', () => {
    const message = apiUnreachableMessage('http://localhost:3000');
    expect(message).toContain('127.0.0.1:3000');
    expect(message).toContain('netstat -ano | findstr :3000');
  });
});

describe('fetchWithTimeout', () => {
  it('turns a refused connection into an ApiUnreachableError carrying the attempted URL', async () => {
    const port = await findClosedPort();
    const url = `http://127.0.0.1:${port}/api/v1/builds`;

    await expect(fetchWithTimeout(url)).rejects.toBeInstanceOf(ApiUnreachableError);
    await expect(fetchWithTimeout(url)).rejects.toMatchObject({ url });
  });
});
