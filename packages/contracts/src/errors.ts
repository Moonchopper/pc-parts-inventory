import { z } from './z.js';

/** M0-seed.md §4 — the shape of every non-2xx response, verbatim. */
export const ApiError = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('ApiError');
export type ApiError = z.infer<typeof ApiError>;
