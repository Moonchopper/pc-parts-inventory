/**
 * D16 — the API never derives a user-facing URL from its own request origin. `PUBLIC_ORIGIN` (set
 * by `compose.yaml`'s `api` service to the *web* origin, `http://localhost:5173`) is the one source
 * for every URL that leaves the system — today the Markdown share footer, later webhooks/emails.
 * Falling back to the request origin is a *dev-only* convenience (no compose, no env var set,
 * `pnpm dev`/`pnpm harness` hitting the API directly) — it is never correct for a Docker deployment,
 * where the request origin is the container-internal hostname (`http://api:3000`, F10's bug).
 */
export function publicOrigin(requestOrigin: string): string {
  const configured = process.env.PUBLIC_ORIGIN;
  return configured && configured.length > 0 ? configured : requestOrigin;
}
