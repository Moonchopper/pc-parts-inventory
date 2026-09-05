/**
 * `pnpm harness --name <n>` (root script: `tsx tools/harness/harness.ts`).
 *
 * Boots the API as a child process on an ephemeral port (`PORT=0`) against a fresh temp SQLite file
 * (gotcha 4 in the seed brief's Recon: three implementers run this in three worktrees at once, so
 * neither the port nor the DB file may be hard-coded), runs migrations + owner seed (serve.ts does
 * this on its own boot), discovers checks under ./checks (Seam 2), runs them in filename order, and
 * writes `artifacts/harness/<name>/report.json` (Seam 3).
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ScanPayload } from '@pcpi/contracts';
import { type Counters, defaultCounters, type HarnessCheck, type HarnessCtx } from './types.js';

type ApiChildProcess = ChildProcessByStdio<null, Readable, Readable>;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

function parseArgs(argv: string[]): { name: string } {
  const idx = argv.indexOf('--name');
  const name = idx >= 0 ? argv[idx + 1] : undefined;
  return { name: name ?? 'default' };
}

function waitForPort(child: ApiChildProcess, timeoutMs = 15_000): Promise<number> {
  return new Promise((resolvePort, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    const timer = setTimeout(() => {
      reject(
        new Error(
          `API child process did not report a port within ${timeoutMs}ms.\nstdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf-8');
      let newlineIndex = stdoutBuf.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = stdoutBuf.slice(0, newlineIndex).trim();
        stdoutBuf = stdoutBuf.slice(newlineIndex + 1);
        if (line) {
          try {
            const parsed = JSON.parse(line) as { port?: unknown };
            if (typeof parsed.port === 'number') {
              clearTimeout(timer);
              resolvePort(parsed.port);
              return;
            }
          } catch {
            // Not JSON (tsx/Node startup noise) — ignore.
          }
        }
        newlineIndex = stdoutBuf.indexOf('\n');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString('utf-8');
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API child process exited early (code ${code}).\nstderr:\n${stderrBuf}`));
    });
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main(): Promise<void> {
  const { name } = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const artifactsDir = resolve(repoRoot, 'artifacts', 'harness', name);
  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });

  const tmpDbDir = mkdtempSync(join(tmpdir(), 'pcpi-harness-'));
  const dbPath = join(tmpDbDir, 'pcpi.db');
  const servePath = resolve(repoRoot, 'apps', 'api', 'src', 'serve.ts');

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: `file:${dbPath}`,
    PORT: '0',
    HARNESS: '1',
  };
  childEnv.API_TOKEN = undefined;

  const child = spawn(process.execPath, ['--import', 'tsx', servePath], {
    cwd: repoRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const errors: string[] = [];
  const checksResults: Array<{ id: string; ok: boolean; ms: number; detail: string }> = [];
  const counters: Counters = defaultCounters();
  let ok = true;

  try {
    const port = await waitForPort(child);
    const apiUrl = `http://127.0.0.1:${port}`;

    const fixturePath = resolve(repoRoot, 'packages', 'contracts', 'fixtures', 'scan.sample.json');
    const fixture = ScanPayload.parse(JSON.parse(readFileSync(fixturePath, 'utf-8')));

    const checksDir = resolve(here, 'checks');
    const checkFiles = readdirSync(checksDir)
      .filter((f) => f.endsWith('.ts'))
      .sort();

    const state: Record<string, unknown> = {};

    for (const file of checkFiles) {
      const mod = (await import(pathToFileURL(resolve(checksDir, file)).href)) as {
        default: HarnessCheck;
      };
      const check = mod.default;
      let checkFailed = false;
      const messages: string[] = [];

      const ctx: HarnessCtx = {
        apiUrl,
        artifactsDir,
        fixture,
        state,
        counters,
        fail(msg: string) {
          checkFailed = true;
          messages.push(msg);
          errors.push(`${check.id}: ${msg}`);
        },
      };

      const start = Date.now();
      try {
        await check.run(ctx);
      } catch (err) {
        checkFailed = true;
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        messages.push(msg);
        errors.push(`${check.id}: ${msg}`);
      }
      const ms = Date.now() - start;

      const detail = typeof state.detail === 'string' ? state.detail : messages.join('; ');
      delete state.detail;

      checksResults.push({ id: check.id, ok: !checkFailed, ms, detail });
      if (checkFailed) ok = false;
    }
  } catch (err) {
    ok = false;
    errors.push(err instanceof Error ? (err.stack ?? err.message) : String(err));
  } finally {
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
    try {
      rmSync(tmpDbDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; a lingering temp file is not a gate failure.
    }
  }

  const report = {
    name,
    ok,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    counters,
    checks: checksResults,
    errors,
  };
  writeFileSync(join(artifactsDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

  console.log(
    `harness "${name}": ${ok ? 'OK' : 'FAILED'} — see ${join(artifactsDir, 'report.json')}`,
  );
  for (const c of checksResults) {
    console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.id} (${c.ms}ms): ${c.detail}`);
  }
  if (!ok) {
    for (const e of errors) console.error(`error: ${e}`);
  }

  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
