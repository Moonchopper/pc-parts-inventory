import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { INSTANCE_ID } from '../boot-check.js';

export const routes = new OpenAPIHono();

// F2 — additive: `instanceId` identifies *this* process, so `verifyOwnListener` (boot-check.ts) can
// tell a genuine response from this API apart from something else answering the same port (a stale
// `tsx watch`, VS Code squatting `127.0.0.1:{port}`, …). No field removed or renamed.
const HealthResponse = z
  .object({
    ok: z.literal(true),
    version: z.string(),
    db: z.literal('sqlite'),
    instanceId: z.string(),
  })
  .openapi('HealthResponse');

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: { 'application/json': { schema: HealthResponse } },
        description: 'Liveness/readiness check.',
      },
    },
  }),
  (c) =>
    c.json(
      { ok: true as const, version: '0.1.0', db: 'sqlite' as const, instanceId: INSTANCE_ID },
      200,
    ),
);
