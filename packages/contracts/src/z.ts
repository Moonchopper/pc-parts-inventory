/**
 * The one `z` every schema file in this package (and every schema file in apps/api that needs
 * `.openapi(...)` metadata) must import.
 *
 * Gotcha (recorded in the seed brief's Recon): `@hono/zod-openapi` re-exports zod's `z` decorated
 * with `.openapi()`. Importing a bare `zod` alongside this re-exported one silently loses the
 * OpenAPI metadata on any schema built from the bare import. There is exactly one `z` in this
 * codebase, and it lives here.
 */
export { z } from '@hono/zod-openapi';
