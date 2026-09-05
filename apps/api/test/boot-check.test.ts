import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { createApp } from '../src/app.js';
import { INSTANCE_ID, verifyOwnListener } from '../src/boot-check.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedOwner } from '../src/db/seed.js';

// Isolated DB for this test file (vitest gives each file its own module instance — see
// apps/api/test/api.test.ts for the established pattern).
process.env.DATABASE_URL = ':memory:';
delete process.env.API_TOKEN;

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo | null;
      if (!address || typeof address === 'string') {
        reject(new Error('could not read an ephemeral port'));
        return;
      }
      resolvePort(address.port);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((r) => server.close(() => r()));
}

describe('verifyOwnListener — F2 boot self-check', () => {
  let stub: ReturnType<typeof createServer> | undefined;

  afterEach(async () => {
    if (stub) {
      await close(stub);
      stub = undefined;
    }
  });

  it('ok: false, naming the port, when a *different* instanceId answers /api/v1/health (the wrong-listener footgun)', async () => {
    stub = createServer((req, res) => {
      if (req.url === '/api/v1/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            version: '0.1.0',
            db: 'sqlite',
            instanceId: 'some-other-process',
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const port = await listen(stub);

    const result = await verifyOwnListener(port);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(String(port));
      expect(result.reason).toContain('some-other-process');
    }
  });

  it("ok: true against the real app, answering with this process's own INSTANCE_ID", async () => {
    runMigrations();
    seedOwner();
    const app: App = createApp();
    const server = createServer((req, res) => {
      void (async () => {
        const url = `http://127.0.0.1${req.url}`;
        const response = await app.request(url, { method: req.method });
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        res.end(Buffer.from(await response.arrayBuffer()));
      })();
    });
    stub = server;
    const port = await listen(server);

    const result = await verifyOwnListener(port);

    expect(result).toEqual({ ok: true });
  });

  it('ok: false on a timeout/connection-refused when nothing is listening on the port', async () => {
    // Bind an ephemeral server just to learn a free port, then close it immediately so nothing is
    // listening there for the actual assertion — the same "find a free port" trick harness checks
    // use (tools/harness/checks/40-web.ts).
    const probe = createServer();
    const freePort = await listen(probe);
    await close(probe);

    const result = await verifyOwnListener(freePort, 200);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain(String(freePort));
    }
  });

  it('INSTANCE_ID is a non-empty string, generated once per process', () => {
    expect(typeof INSTANCE_ID).toBe('string');
    expect(INSTANCE_ID.length).toBeGreaterThan(0);
  });
});
