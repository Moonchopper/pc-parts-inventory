import { Category } from './category.js';
import { z } from './z.js';

/**
 * M0-seed.md §4 — ScanPayload v1: what every scanner emits and `POST /imports/scans` accepts.
 */

const SpecValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ScanComponent = z
  .object({
    category: Category,
    manufacturer: z.string().min(1),
    model: z.string().min(1),
    partNumber: z.string().min(1).optional(),
    /** Windows CIM emits placeholder strings ("Default string", "None", ...) for missing serials;
     * scanners should pass those through as `null` — `normalizeScan` treats both the same way. */
    serial: z.string().nullable().optional(),
    quantity: z.number().int().positive().default(1),
    slot: z.string().min(1).optional(),
    specs: z.record(z.string(), SpecValue),
  })
  .openapi('ScanComponent');
export type ScanComponent = z.infer<typeof ScanComponent>;

export const ScanPayload = z
  .object({
    schemaVersion: z.literal(1),
    scanner: z.object({
      name: z.string().min(1),
      version: z.string().min(1),
      os: z.enum(['windows', 'macos', 'linux']),
    }),
    host: z.object({
      hostname: z.string().min(1),
      scannedAt: z.string().datetime({ offset: true }),
    }),
    components: z.array(ScanComponent).min(1),
  })
  .openapi('ScanPayload');
export type ScanPayload = z.infer<typeof ScanPayload>;
