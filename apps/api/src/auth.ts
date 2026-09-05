import type { ApiError } from '@pcpi/contracts';
import type { MiddlewareHandler } from 'hono';

/**
 * D3 — when `API_TOKEN` is set, mutating routes require `Authorization: Bearer <token>`; when
 * unset (dev/harness), open. Share routes never use this middleware — they are always public.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = process.env.API_TOKEN;
  if (!token) {
    await next();
    return;
  }
  if (c.req.header('Authorization') !== `Bearer ${token}`) {
    const body: ApiError = {
      error: { code: 'unauthorized', message: 'Missing or invalid bearer token' },
    };
    return c.json(body, 401);
  }
  await next();
};
