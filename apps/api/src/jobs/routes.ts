import { OpenAPIHono } from '@hono/zod-openapi';
import { validationHook } from '../openapi-hook.js';

// Empty on purpose. W0.3 (pricing-and-jobs) fills this in: `POST /jobs/run-due` (D10, enabled only
// when HARNESS=1 or dev). Exported and mounted (at `/api/v1/jobs`) so app.ts never changes again.
export const routes = new OpenAPIHono({ defaultHook: validationHook });
