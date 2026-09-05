import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

export const routes = new OpenAPIHono();

const HealthResponse = z
  .object({
    ok: z.literal(true),
    version: z.string(),
    db: z.literal('sqlite'),
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
  (c) => c.json({ ok: true as const, version: '0.1.0', db: 'sqlite' as const }, 200),
);
