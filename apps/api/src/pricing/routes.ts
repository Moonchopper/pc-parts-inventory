import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { QuoteKind } from '@pcpi/contracts';
import { validationHook } from '../openapi-hook.js';
import { listAllProviders } from './registry.js';

// Mounted at `/api/v1/providers` (app.ts, unchanged by this brief).
export const routes = new OpenAPIHono({ defaultHook: validationHook });

const ProviderInfoSchema = z
  .object({
    id: z.string(),
    kinds: z.array(QuoteKind),
    configured: z.boolean(),
  })
  .openapi('ProviderInfo');

routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(ProviderInfoSchema) } },
        description:
          'Every pricing provider M0 knows about (not just the ones PRICING_PROVIDERS activates)',
      },
    },
  }),
  (c) => c.json(listAllProviders(), 200),
);
