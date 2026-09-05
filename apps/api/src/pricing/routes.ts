import { OpenAPIHono } from '@hono/zod-openapi';
import { validationHook } from '../openapi-hook.js';

// Empty on purpose. W0.3 (pricing-and-jobs) fills this in: `GET /providers`, plus the pricing
// provider registry wiring. Exported and mounted (at `/api/v1/providers`) so app.ts never changes
// again for this seam.
export const routes = new OpenAPIHono({ defaultHook: validationHook });
