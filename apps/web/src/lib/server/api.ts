import type { ApiError, Valuation } from '@pcpi/contracts';
import { Valuation as ValuationSchema } from '@pcpi/contracts';
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
 */
export const API_BASE_URL = env.API_URL ?? 'http://127.0.0.1:3000';

export const api = createClient<paths>({ baseUrl: API_BASE_URL });

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
  const { data, error, response } = await api.GET('/api/v1/builds/{id}', {
    params: { path: { id } },
  });
  if (response.status === 404) return null;
  if (error || !data) {
    throw new ApiRequestError(
      response.status,
      error?.error.code ?? 'unknown_error',
      error?.error.message ?? 'Failed to load build',
    );
  }
  return data;
}

/** `null` for a 404 (unknown or private slug) — callers turn that into SvelteKit's 404 page. */
export async function getSharedBuild(slug: string) {
  const { data, error, response } = await api.GET('/api/v1/share/{slug}', {
    params: { path: { slug } },
  });
  if (response.status === 404) return null;
  if (error || !data) {
    throw new ApiRequestError(
      response.status,
      error?.error.code ?? 'unknown_error',
      error?.error.message ?? 'Failed to load shared build',
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
  const res = await fetch(`${API_BASE_URL}/api/v1/builds/${encodeURIComponent(buildId)}/valuation`);
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
  const res = await fetch(`${API_BASE_URL}/api/v1/builds/${encodeURIComponent(buildId)}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(slot ? { partId, slot } : { partId }),
  });
  if (!res.ok) await throwFromResponse(res);
}

/** `DELETE /builds/{id}/items/{partId}` (§5) — see `addBuildItem`'s note on it not existing yet. */
export async function removeBuildItem(buildId: string, partId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/v1/builds/${encodeURIComponent(buildId)}/items/${encodeURIComponent(partId)}`,
    { method: 'DELETE', headers: { ...authHeaders() } },
  );
  if (!res.ok) await throwFromResponse(res);
}
