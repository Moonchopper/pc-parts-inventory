import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { Part } from '@pcpi/contracts';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { parts, products } from '../db/schema.js';
import { LOCAL_OWNER_ID } from '../db/seed.js';
import { toPartDTO, toProductDTO } from '../dto.js';
import { validationHook } from '../openapi-hook.js';

export const routes = new OpenAPIHono({ defaultHook: validationHook });

// Filters (`status`, `category`, `buildId`) and the write endpoints in the §5 table are W0.3.
routes.openapi(
  createRoute({
    method: 'get',
    path: '/',
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(Part) } },
        description: 'Parts for the local owner, embedding product',
      },
    },
  }),
  (c) => {
    const rows = getDb()
      .select({ part: parts, product: products })
      .from(parts)
      .innerJoin(products, eq(parts.productId, products.id))
      .where(eq(parts.ownerId, LOCAL_OWNER_ID))
      .all();
    return c.json(
      rows.map(({ part, product }) => toPartDTO(part, { product: toProductDTO(product) })),
      200,
    );
  },
);
