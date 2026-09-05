/**
 * `tsx scripts/validate.ts <file.json> [--schema ScanPayload]`
 *
 * Parses the JSON at <file.json>, validates it against the named schema (default `ScanPayload`),
 * prints a one-line summary and exits 0, or prints the zod issues and exits 1.
 *
 * Used by W0.2's acceptance and by the PM at integration — must work against an arbitrary path,
 * including one outside this package. Resolution note: `pnpm --filter @pcpi/contracts validate …`
 * runs this script with `cwd` set to `packages/contracts` (pnpm's normal `--filter` behavior), not
 * the directory the command was typed from. pnpm sets `INIT_CWD` to that original directory, so a
 * relative <file.json> argument is resolved against `INIT_CWD` (falling back to `process.cwd()`
 * when run directly, e.g. `tsx scripts/validate.ts …` from inside this package). An absolute path
 * argument is unaffected either way.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ApiError,
  Build,
  Import,
  Owner,
  Part,
  Product,
  ScanPayload,
  SharedBuild,
  Valuation,
  type z,
} from '../src/index.js';

type SchemaEntry = {
  schema: z.ZodTypeAny;
  summarize?: (value: unknown) => string;
};

function summarizeScanPayload(value: unknown): string {
  const payload = value as ScanPayload;
  const counts = new Map<string, number>();
  for (const component of payload.components) {
    counts.set(component.category, (counts.get(component.category) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([category, count]) => (count > 1 ? `${category}(${count})` : category))
    .join(',');
  return `${payload.components.length} components, categories: ${categories}`;
}

const SCHEMAS: Record<string, SchemaEntry> = {
  ScanPayload: { schema: ScanPayload, summarize: summarizeScanPayload },
  Owner: { schema: Owner },
  Product: { schema: Product },
  Part: { schema: Part },
  Build: { schema: Build },
  Import: { schema: Import },
  Valuation: { schema: Valuation },
  SharedBuild: { schema: SharedBuild },
  ApiError: { schema: ApiError },
};

function parseArgs(argv: string[]): { file: string; schemaName: string } {
  const args = argv.slice(2);
  const schemaFlagIndex = args.indexOf('--schema');
  let schemaName = 'ScanPayload';
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (schemaFlagIndex >= 0 && i === schemaFlagIndex) continue;
    if (schemaFlagIndex >= 0 && i === schemaFlagIndex + 1) {
      schemaName = args[i] ?? schemaName;
      continue;
    }
    const arg = args[i];
    if (arg !== undefined) positional.push(arg);
  }
  const file = positional[0];
  if (!file) {
    console.error('Usage: validate <file.json> [--schema <SchemaName>]');
    process.exit(1);
  }
  return { file, schemaName };
}

const { file, schemaName } = parseArgs(process.argv);
const entry = SCHEMAS[schemaName];
if (!entry) {
  console.error(`Unknown schema: ${schemaName}. Known: ${Object.keys(SCHEMAS).join(', ')}`);
  process.exit(1);
}

const baseDir = process.env.INIT_CWD ?? process.cwd();
const absPath = resolve(baseDir, file);

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(absPath, 'utf-8'));
} catch (err) {
  console.error(`Could not read/parse ${absPath}: ${(err as Error).message}`);
  process.exit(1);
}

const result = entry.schema.safeParse(raw);
if (!result.success) {
  console.error(`FAIL ${schemaName} ${file}:`);
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const summary = entry.summarize ? entry.summarize(result.data) : 'valid';
console.log(`OK ${schemaName} ${file}: ${summary}`);
process.exit(0);
