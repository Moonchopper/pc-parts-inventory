import { OpenAPIHono } from '@hono/zod-openapi';
import type { ApiError } from '@pcpi/contracts';
import { apiReference } from '@scalar/hono-api-reference';
import { HTTPException } from 'hono/http-exception';
import { routes as buildRoutes } from './builds/routes.js';
import { routes as importRoutes } from './imports/routes.js';
import { routes as jobRoutes } from './jobs/routes.js';
import { validationHook } from './openapi-hook.js';
import { routes as partRoutes } from './parts/routes.js';
import { routes as providerRoutes } from './pricing/routes.js';
import { routes as productRoutes } from './products/routes.js';
import { routes as healthRoutes } from './routes/health.js';
import { routes as shareRoutes } from './share/routes.js';

const OPENAPI_INFO = { title: 'PC Parts Inventory API', version: '0.1.0' } as const;

/**
 * Seam 1 (2026-09-05-m0-seed-workspace-api brief) — every route module below exists and is mounted
 * here, even the ones W0.3 fills in later. No parallel M0 brief needs to touch this file again.
 */
export function createApp() {
  const app = new OpenAPIHono({ defaultHook: validationHook });

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      const body: ApiError = { error: { code: String(err.status), message: err.message } };
      return c.json(body, err.status);
    }
    console.error(err);
    const body: ApiError = { error: { code: 'internal_error', message: 'Internal server error' } };
    return c.json(body, 500);
  });

  app.notFound((c) => {
    const body: ApiError = {
      error: { code: 'not_found', message: `Not found: ${c.req.method} ${c.req.path}` },
    };
    return c.json(body, 404);
  });

  const v1 = new OpenAPIHono({ defaultHook: validationHook });
  v1.route('/health', healthRoutes);
  v1.route('/imports', importRoutes);
  v1.route('/builds', buildRoutes);
  v1.route('/parts', partRoutes);
  v1.route('/products', productRoutes);
  v1.route('/share', shareRoutes);
  v1.route('/providers', providerRoutes);
  v1.route('/jobs', jobRoutes);

  app.route('/api/v1', v1);

  app.doc31('/api/openapi.json', { openapi: '3.1.0', info: OPENAPI_INFO });
  app.get('/api/docs', apiReference({ url: '/api/openapi.json' }));

  return app;
}

export type App = ReturnType<typeof createApp>;
