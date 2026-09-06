import type { ApiError } from '@pcpi/contracts';
import type { Context } from 'hono';

/**
 * Shared `defaultHook` for every `OpenAPIHono` instance in this app. `@hono/zod-openapi`'s own
 * request validation (body/params/query) runs before the route handler and, without this, returns
 * Hono's default validation-error shape instead of the §4 `{ error: { code, message, details? } }`
 * shape every non-2xx response must use.
 *
 * `result`/`c` are typed loosely on purpose: `@hono/zod-openapi`'s `Hook` type is generic over each
 * request part (json/param/query/…) and awkward to name precisely here without importing its
 * internal target-union types just for this one call site.
 */
// biome-ignore lint/suspicious/noExplicitAny: matching @hono/zod-openapi's Hook<...> shape loosely
export function validationHook(result: any, c: Context) {
  if (!result.success) {
    const body: ApiError = {
      error: {
        code: 'invalid_request',
        message: 'Request validation failed',
        details:
          typeof result.error?.flatten === 'function'
            ? result.error.flatten()
            : String(result.error),
      },
    };
    return c.json(body, 400);
  }
}
