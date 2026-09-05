import type { ApiError, Valuation } from '@pcpi/contracts';
import { Valuation as ValuationSchema } from '@pcpi/contracts';
import { error } from '@sveltejs/kit';
import createClient from 'openapi-fetch';
import { env } from '$env/dynamic/private';
// Relative, cross-package import by design (same pattern as packages/contracts/scripts/gen.ts):
// the generated client types are not part of @pcpi/contracts's package.json `exports`, and W0.4's
// scope may not touch packages/contracts to add a subpath export for them.
import type { paths } from '../../../../../packages/contracts/generated/client.js';

/**
 * D2 / Recon #3 — `API_URL` is server-side only. `$env/dynamic/private` (not `$env/static/public`)
 * so the container can set it at run time (W0.6: `API_URL=http://api:3000`); this module must never
 * be imported from a `.svelte` file or anything that ships to the browser.
 *
 * F2: `localhost`, not `127.0.0.1` — the API binds `0.0.0.0`, but on Windows VS Code can squat the
 * more specific `127.0.0.1:3000`, and the more specific binding wins for `127.0.0.1` traffic. Every
 * request below carries `API_TIMEOUT_MS` regardless, so a squatted port fails fast instead of
 * hanging even if this default ever points at the wrong process again.
 */
export const API_BASE_URL = env.API_URL ?? 'http://localhost:3000';

/** F2 — every SSR request to the API (the openapi-fetch client below and the hand-rolled `fetch`
 * helpers further down) carries this timeout, so an unreachable API fails fast instead of hanging
 * the page load forever. */
export const API_TIMEOUT_MS = 5000;

/** F2 — thrown by `fetchWithTimeout` (below) on a timeout or a connection failure (e.g. refused,
 * DNS failure). Callers let it propagate to a `load` function, which turns it into a 503 via
 * `rethrowApiUnreachable` so `+error.svelte` shows a readable message instead of a stack trace or
 * an endless spinner. */
export class ApiUnreachableError extends Error {
  readonly url: string;

  constructor(url: string, options?: { cause?: unknown }) {
    super(apiUnreachableMessage(url));
    this.name = 'ApiUnreachableError';
    this.url = url;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** F2 — the text `+error.svelte` shows for an `ApiUnreachableError`: names the URL that was tried,
 * asks whether the API is running, and carries the same port-squatting footgun `CLAUDE.md` warns
 * about (`pnpm dev`'s block) so the reader knows to check for it before assuming the API crashed. */
export function apiUnreachableMessage(baseUrl: string): string {
  return (
    `Could not reach the API at ${baseUrl}. Is it running? ` +
    'VS Code can squat 127.0.0.1:3000 — Node then binds with no error and every request hangs; ' +
    'run `netstat -ano | findstr :3000` before assuming the API crashed.'
  );
}

/**
 * F2 — wraps `fetch` with `API_TIMEOUT_MS` and turns a timeout or a connection failure into an
 * `ApiUnreachableError` instead of leaving the caller to hang or to see a raw `TypeError`. Signature
 * matches both `globalThis.fetch` (the four hand-rolled helpers below call it directly in place of
 * `fetch`) and openapi-fetch's `ClientOptions['fetch']` (`(input: Request) => Promise<Response>`,
 * a subtype of this function's parameter — `api` below passes it straight through as the client's
 * custom `fetch`), so there is exactly one timeout implementation for every SSR request in this
 * file.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (cause) {
    throw new ApiUnreachableError(url, { cause });
  } finally {
    clearTimeout(timer);
  }
}

/** F2 — call from a `load` function's `catch` block: turns `ApiUnreachableError` into SvelteKit's
 * 503 error page (`+error.svelte`), and rethrows anything else (including SvelteKit's own
 * `error(404, …)`) unchanged. */
export function rethrowApiUnreachable(err: unknown): never {
  if (err instanceof ApiUnreachableError) {
    error(503, err.message);
  }
  throw err;
}

export const api = createClient<paths>({ baseUrl: API_BASE_URL, fetch: fetchWithTimeout });

/** Thrown by the helpers below; callers surface `.message` (never a stack trace) per the §4 error shape. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

function authHeaders(): Record<string, string> {
  const token = env.API_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function throwFromResponse(res: Response): Promise<never> {
  const body: unknown = await res.json().catch(() => undefined);
  const parsed = body as ApiError | undefined;
  const message = parsed?.error?.message ?? `Request failed (${res.status})`;
  const code = parsed?.error?.code ?? 'unknown_error';
  throw new ApiRequestError(res.status, code, message);
}

export async function listParts() {
  const { data } = await api.GET('/api/v1/parts');
  return data ?? [];
}

export async function listBuilds() {
  const { data } = await api.GET('/api/v1/builds');
  return data ?? [];
}

/** `null` for a 404 (unknown or private build) — callers turn that into SvelteKit's 404 page. */
export async function getBuild(id: string) {
  const {
    data,
    error: apiError,
    response,
  } = await api.GET('/api/v1/builds/{id}', {
    params: { path: { id } },
  });
  if (response.status === 404) return null;
  if (apiError || !data) {
    throw new ApiRequestError(
      response.status,
      apiError?.error.code ?? 'unknown_error',
      apiError?.error.message ?? 'Failed to load build',
    );
  }
  return data;
}

/** `null` for a 404 (unknown or private slug) — callers turn that into SvelteKit's 404 page. */
export async function getSharedBuild(slug: string) {
  const {
    data,
    error: apiError,
    response,
  } = await api.GET('/api/v1/share/{slug}', {
    params: { path: { slug } },
  });
  if (response.status === 404) return null;
  if (apiError || !data) {
    throw new ApiRequestError(
      response.status,
      apiError?.error.code ?? 'unknown_error',
      apiError?.error.message ?? 'Failed to load shared build',
    );
  }
  return data;
}

/**
 * `GET /builds/{id}/valuation` (§5) is not in the generated client yet — W0.3 is adding it in
 * parallel (Recon #5). Plain `fetch` against the documented path, validated at runtime against the
 * §4 `Valuation` schema; `null` on a 404 *or* an unrecognised body so the build page can render
 * "valuation unavailable" instead of crashing while that route doesn't exist on this branch.
 */
export async function getValuation(buildId: string): Promise<Valuation | null> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/builds/${encodeURIComponent(buildId)}/valuation`,
  );
  if (!res.ok) return null;
  const body: unknown = await res.json().catch(() => undefined);
  const parsed = ValuationSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * `POST /builds/{id}/items` (§5) — also not implemented on this branch yet (builds/routes.ts only
 * has the two GETs today). Coded against the documented contract; a 404 surfaces as a normal
 * `ApiRequestError` that the form action turns into a user-facing message, not a crash.
 */
export async function addBuildItem(buildId: string, partId: string, slot?: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/builds/${encodeURIComponent(buildId)}/items`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(slot ? { partId, slot } : { partId }),
    },
  );
  if (!res.ok) await throwFromResponse(res);
}

/** `DELETE /builds/{id}/items/{partId}` (§5) — see `addBuildItem`'s note on it not existing yet. */
export async function removeBuildItem(buildId: string, partId: string): Promise<void> {
  const res = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/builds/${encodeURIComponent(buildId)}/items/${encodeURIComponent(partId)}`,
    { method: 'DELETE', headers: { ...authHeaders() } },
  );
  if (!res.ok) await throwFromResponse(res);
}

/**
 * `PATCH /parts/{id}` (§5, `m0-crud-endpoints`) — Task 5.2: the inline "acquired price" edit on
 * the inventory row. Integer minor units on the wire (D6) — the caller is responsible for never
 * sending a float.
 */
export async function patchPart(id: string, patch: { acquiredPriceCents: number }): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/parts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await throwFromResponse(res);
}
