import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ApiError } from '@pcpi/contracts';
import { requireAuth } from '../auth.js';
import { validationHook } from '../openapi-hook.js';
import { runDueJobs, startTickLoopUnlessDisabled } from './runner.js';

// Mounted at `/api/v1/jobs` (app.ts, unchanged by this brief).
export const routes = new OpenAPIHono({ defaultHook: validationHook });

routes.use('/run-due', requireAuth);

/** D10 — `POST /jobs/run-due` only exists when HARNESS=1 or NODE_ENV=development (determinism). */
function runDueEndpointEnabled(): boolean {
  return process.env.HARNESS === '1' || process.env.NODE_ENV === 'development';
}

const JobResultSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    status: z.enum(['done', 'failed']),
    detail: z.string(),
  })
  .openapi('JobResult');

const RunDueResponse = z
  .object({ ran: z.number().int(), results: z.array(JobResultSchema) })
  .openapi('RunDueResponse');

routes.openapi(
  createRoute({
    method: 'post',
    path: '/run-due',
    responses: {
      200: {
        content: { 'application/json': { schema: RunDueResponse } },
        description: 'Every currently-due job was run once to completion',
      },
      401: { content: { 'application/json': { schema: ApiError } }, description: 'Unauthorized' },
      404: {
        content: { 'application/json': { schema: ApiError } },
        description: 'Not available outside HARNESS=1 / NODE_ENV=development',
      },
    },
  }),
  async (c) => {
    if (!runDueEndpointEnabled()) {
      const body: ApiError = {
        error: { code: 'not_found', message: 'Not found: POST /jobs/run-due' },
      };
      return c.json(body, 404);
    }
    const result = await runDueJobs();
    return c.json(result, 200);
  },
);

// D10's 30s tick loop starts here — not in serve.ts/app.ts, which this brief must not touch — by
// being a side effect of this module's own load. app.ts already imports this file unconditionally
// at process start (Seam 1), so this is "started with the API server" without editing app.ts; the
// function itself short-circuits under HARNESS=1 and vitest.
startTickLoopUnlessDisabled();
