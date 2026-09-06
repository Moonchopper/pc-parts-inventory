import { randomUUID } from 'node:crypto';

/**
 * F2 — the Windows footgun this exists to catch: a socket on `127.0.0.1:{port}` and another on
 * `0.0.0.0:{port}` can coexist, and the *more specific* one wins for `localhost` traffic. `serve()`
 * binds and logs its port line with zero indication that a *different* process (VS Code, a stale
 * `tsx watch` from another worktree, …) is the one actually answering `localhost` requests. There
 * was no per-process identity in the health DTO to tell the two apart — `INSTANCE_ID` is that
 * identity: one random id generated once per process, at module load, so two processes never share
 * one by construction.
 */
export const INSTANCE_ID: string = randomUUID();

export type VerifyOwnListenerResult = { ok: true } | { ok: false; reason: string };

/**
 * `GET http://127.0.0.1:{port}/api/v1/health` and confirm the response is *this* process
 * (`instanceId === INSTANCE_ID`) — called once from `serve.ts` right after the port line prints.
 * Exported and unit-testable on its own (never inlined into `serve.ts`): a stub listener with a
 * different `instanceId` reproduces the exact failure mode (`ok: false`, reason names the port and
 * what answered instead); nothing listening reproduces the timeout/connection-refused case.
 */
export async function verifyOwnListener(
  port: number,
  timeoutMs = 2000,
): Promise<VerifyOwnListenerResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: `port ${port} answered with HTTP ${res.status}, expected 200` };
    }
    const body = (await res.json()) as { instanceId?: unknown };
    if (body.instanceId !== INSTANCE_ID) {
      return {
        ok: false,
        reason:
          `port ${port} answered as instanceId ${JSON.stringify(body.instanceId)}, ` +
          `not this process's ${INSTANCE_ID} — something else is listening on this port`,
      };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `no response from port ${port} within ${timeoutMs}ms (${message})`,
    };
  } finally {
    clearTimeout(timer);
  }
}
