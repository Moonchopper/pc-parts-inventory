import { type ChildProcessByStdio, spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { HarnessCheck, Json } from '../types.js';

type WebChildProcess = ChildProcessByStdio<null, Readable, Readable>;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const webDir = resolve(repoRoot, 'apps', 'web');

const OG_PROPERTIES = ['og:title', 'og:description', 'og:image', 'og:url'];

/** `PORT=0` is not honoured by adapter-node (Recon #6) — find a free port ourselves. */
function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (address === null || typeof address === 'string') {
        srv.close(() => reject(new Error('could not read an ephemeral port')));
        return;
      }
      const { port } = address;
      srv.close(() => resolvePort(port));
    });
  });
}

/** Poll until the adapter-node server accepts connections (any HTTP response counts as ready). */
async function waitForReady(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`web server did not become ready within ${timeoutMs}ms (${url})`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

async function killChild(child: WebChildProcess): Promise<void> {
  child.kill();
  await new Promise<void>((r) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      r();
      return;
    }
    const t = setTimeout(r, 3000);
    child.once('exit', () => {
      clearTimeout(t);
      r();
    });
  });
}

export default {
  id: 'web',
  async run(ctx) {
    // Self-contained rather than reading ctx.state.slug: filename order puts `40-web.ts` before
    // `50-builds.ts`/`60-share.ts` (which populate that state), so this check finds its own slug
    // and its own share JSON straight from the API instead of depending on run order.
    const buildsRes = await fetch(`${ctx.apiUrl}/api/v1/builds`);
    if (buildsRes.status !== 200) {
      ctx.fail(`GET /builds returned ${buildsRes.status}, expected 200 (needed a slug)`);
      return;
    }
    const builds: Json = await buildsRes.json();
    if (!Array.isArray(builds) || builds.length === 0) {
      ctx.fail('no builds returned by the API; cannot exercise /b/{slug}');
      return;
    }
    const slug: string = builds[0].slug;

    const shareRes = await fetch(`${ctx.apiUrl}/api/v1/share/${slug}`);
    if (shareRes.status !== 200) {
      ctx.fail(`GET /share/${slug} returned ${shareRes.status}, expected 200`);
      return;
    }
    const shared: Json = await shareRes.json();
    const models: string[] = Array.isArray(shared.items)
      ? shared.items.map((item: Json) => item.model)
      : [];

    const build = spawnSync('pnpm', ['--filter', '@pcpi/web', 'build'], {
      cwd: repoRoot,
      shell: true,
      encoding: 'utf-8',
    });
    if (build.status !== 0) {
      ctx.fail(`apps/web build failed (exit ${build.status}):\n${build.stdout}\n${build.stderr}`);
      return;
    }

    const port = await findFreePort();
    const webUrl = `http://127.0.0.1:${port}`;
    const serverEntry = resolve(webDir, 'build', 'index.js');

    const child = spawn(process.execPath, [serverEntry], {
      cwd: webDir,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', API_URL: ctx.apiUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    }) as WebChildProcess;

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    try {
      const shareUrl = `${webUrl}/b/${slug}`;
      await waitForReady(shareUrl);

      const res = await fetch(shareUrl);
      if (res.status !== 200) {
        ctx.fail(`GET ${shareUrl} returned ${res.status}, expected 200\nstderr:\n${stderr}`);
        return;
      }
      ctx.webUrl = webUrl;

      const html = await res.text();
      const bytes = Buffer.byteLength(html, 'utf-8');
      writeFileSync(resolve(ctx.artifactsDir, 'share.html'), html, 'utf-8');

      const ogTagCount = OG_PROPERTIES.filter((p) => html.includes(`property="${p}"`)).length;
      if (ogTagCount !== 4) {
        const missing = OG_PROPERTIES.filter((p) => !html.includes(`property="${p}"`));
        ctx.fail(`expected 4 OG tags, found ${ogTagCount} (missing: ${missing.join(', ') || 'none'})`);
      }

      const missingModels = models.filter((m) => !html.includes(m));
      if (missingModels.length > 0) {
        ctx.fail(`share HTML is missing item model strings: ${missingModels.join(', ')}`);
      }

      ctx.counters.share.html.ogTags = ogTagCount;
      ctx.counters.share.html.bytes = bytes;

      const presentModels = models.length - missingModels.length;
      ctx.state.detail = `GET ${shareUrl} -> 200, ${ogTagCount} OG tags, ${bytes} bytes, ${presentModels}/${models.length} item models present`;
    } finally {
      await killChild(child);
    }
  },
} satisfies HarnessCheck;
