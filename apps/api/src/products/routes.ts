import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { Category, Product } from '@pcpi/contracts';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { products } from '../db/schema.js';
import { LOCAL_OWNER_ID } from '../db/seed.js';
import { toProductDTO } from '../dto.js';
import { validationHook } from '../openapi-hook.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

// `GET /products/{id}`, `PATCH /products/{id}`, `/quotes`, `/refresh`, `/links` are W0.3.
routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    request: { query: z.object({ category: Category.optional() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(Product) } },
        description: 'Products for the local owner',
      },
    },
  }),
  (c) => {
    const { category } = c.req.valid('query');
    const conditions = [eq(products.ownerId, LOCAL_OWNER_ID)];
    if (category) conditions.push(eq(products.category, category));
    const rows = getDb()
      .select()
      .from(products)
      .where(and(...conditions))
      .all();
    return c.json(rows.map(toProductDTO), 200);
  },
);
