import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { ApiError, SharedBuild } from '@pcpi/contracts';
import { validationHook } from '../openapi-hook.js';
import { renderCardPng } from './card.js';
import { cardETag } from './etag.js';
import { renderShareMarkdown } from './markdown.js';
import { loadSharedBuild } from './service.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

function notFound(slug: string): ApiError {
  return { error: { code: 'not_found', message: `Build ${slug} not found` } };
}

/**
 * `GET /{slug}.md` (W0.5, deliverable 1).
 *
 * Hono's router has no way to mix a literal suffix into the same path segment as a zod-openapi
 * `{param}` — `path: '/{slug}.md'` compiles (via `@hono/zod-openapi`'s `/{(.+?)}/ -> /:$1`
 * replace) to a Hono token whose *param name* becomes the literal `slug.md`, which structurally
 * matches the exact same `[^/]+` pattern as the plain `/{slug}` route below and loses to it
 * (verified empirically on this branch — both routes end up as an identical single-segment
 * capture, and the router grouping favors the plain one). `:slug{.+\.md}` is Hono's own supported
 * extension-routing idiom instead: the whole segment (e.g. `abc123.md`) is captured under `slug`
 * and the literal `.md` suffix is stripped by hand below. Because this bypasses zod-openapi's
 * bracket conversion, the route is wired as a plain Hono `.get()` (registered *before* the plain
 * `/{slug}` route — order decides the winner when patterns collide) and documented separately via
 * `openAPIRegistry.registerPath` so `.md` still appears in `openapi.json` like every other route.
 */
routes.get('/:slug{.+\\.md}', (c) => {
  const raw = c.req.param('slug');
  const slug = raw.slice(0, -'.md'.length);
  const shared = loadSharedBuild(slug);
  if (!shared) {
    return c.json(notFound(slug), 404);
  }
  const shareUrl = `${new URL(c.req.url).origin}/api/v1/share/${shared.slug}`;
  const body = renderShareMarkdown(shared, shareUrl);
  return c.text(body, 200, {
    'content-type': 'text/markdown; charset=utf-8',
    'cache-control': 'public, max-age=60',
  });
});

routes.openAPIRegistry.registerPath({
  method: 'get',
  path: '/{slug}.md',
  request: { params: z.object({ slug: z.string() }) },
  responses: {
    200: {
      content: { 'text/markdown': { schema: z.string() } },
      description: 'Shared build as a PCPartPicker-style Markdown table — one row per item',
    },
    404: {
      content: { 'application/json': { schema: ApiError } },
      description: 'Not found or private',
    },
  },
});

routes.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: SharedBuild } },
        description:
          'Shared build (JSON) — never includes serials, notes, acquiredSource or owner data',
      },
      404: {
        content: { 'application/json': { schema: ApiError } },
        description: 'Not found or private',
      },
    },
  }),
  (c) => {
    const { slug } = c.req.valid('param');
    const shared = loadSharedBuild(slug);
    if (!shared) {
      return c.json(notFound(slug), 404);
    }
    return c.json(shared, 200);
  },
);

/** `GET /{slug}/card.png` (W0.5, deliverable 2) — a distinct path segment count from `/{slug}`, so no routing ambiguity. */
routes.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}/card.png',
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: {
        content: { 'image/png': { schema: z.string().openapi({ format: 'binary' }) } },
        description: '1200×630 PNG share card (satori + resvg, no headless browser — R6)',
      },
      304: { description: 'Not modified — `If-None-Match` matched the current ETag' },
      404: {
        content: { 'application/json': { schema: ApiError } },
        description: 'Not found or private',
      },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid('param');
    const shared = loadSharedBuild(slug);
    if (!shared) {
      return c.json(notFound(slug), 404);
    }

    const etag = cardETag(shared.slug, shared.updatedAt);
    if (c.req.header('if-none-match') === etag) {
      return c.body(null, 304, { etag, 'cache-control': 'public, max-age=60' });
    }

    const png = await renderCardPng(shared);
    return c.body(new Uint8Array(png), 200, {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=60',
      etag,
    });
  },
);
