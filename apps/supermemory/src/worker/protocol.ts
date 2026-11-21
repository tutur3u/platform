import { z } from 'zod';

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_PURGE_BATCH = 50;
const MAX_RESULTS = 500;
export const VECTOR_DIMENSIONS = 3072;

const tag = z.string().min(1).max(160);
const identifier = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !/[^a-zA-Z0-9._-]/.test(value));
const revision = z.string().regex(/^(0|[1-9][0-9]{0,18})$/);
const memoryText = z.string().trim().min(1).max(20_000);
const embedding = z
  .array(z.number().min(-65504).max(65504))
  .length(VECTOR_DIMENSIONS)
  .refine((values) => values.some((value) => Math.abs(value) >= 2 ** -24));
const metadata = z
  .record(z.string(), z.json())
  .refine((value) => JSON.stringify(value).length <= 16_000);
const limit = z.number().int().min(1).max(MAX_RESULTS);
const filter = z.custom<Filter>(isFilter).optional();
const container = z.object({ containerTag: tag });
const editScope = container.extend({
  id: identifier,
  userId: identifier.optional(),
  wsId: identifier.optional(),
  product: identifier.optional(),
});
const replacement = z.object({ customId: identifier, revision });
const add = container.extend({
  customId: identifier,
  content: memoryText,
  embedding,
  metadata: metadata.default({}),
});
const readByCustomId = container.extend({ customId: identifier });
const update = editScope.extend({
  revision,
  content: memoryText,
  embedding,
});
const forget = container
  .extend({
    id: identifier,
    reason: z.string().max(256).optional(),
    revision: revision.optional(),
    replacement: replacement.optional(),
  })
  .refine((body) => !body.replacement || body.revision !== undefined);

const purge = container
  .extend({
    customIds: z.array(identifier).min(1).max(MAX_PURGE_BATCH).optional(),
    customIdPrefix: identifier.optional(),
    expectedRevision: revision,
    requestId: z.uuid(),
    replacement: replacement.optional(),
  })
  .refine((body) => !body.customIds || !body.customIdPrefix);

const search = container.extend({
  embedding,
  filters: filter,
  limit: limit.default(20),
  q: z.string().max(4000).default(''),
});
const list = z.object({
  containerTags: z.array(tag).min(1).max(20),
  filters: filter,
  includeContent: z.boolean().default(true),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: limit.default(100),
});

export const operations = {
  '/v1/memories': { operation: 'add', schema: add },
  '/v1/memories/read-by-custom-id': {
    operation: 'read_by_custom_id',
    schema: readByCustomId,
  },
  '/v1/memories/read': { operation: 'read', schema: editScope },
  '/v1/memories/update': { operation: 'update', schema: update },
  '/v1/memories/forget': { operation: 'forget', schema: forget },
  '/v1/memories/purge': { operation: 'purge', schema: purge },
  '/v1/search': { operation: 'search', schema: search },
  '/v1/documents/list': { operation: 'list', schema: list },
} as const;

type Operations = (typeof operations)[keyof typeof operations];
type CommandFor<T extends Operations> = T extends Operations
  ? { operation: T['operation']; body: z.output<T['schema']> }
  : never;

export type Command = CommandFor<Operations>;
export type Caller = 'assistant' | 'people-registry';
export type StoreResponse = { status?: number; body: object };
export type Store = (
  caller: Caller,
  command: Command
) => Promise<StoreResponse>;

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Filter =
  | { filterType: 'metadata'; key: string; value: string | number | boolean }
  | { AND: Filter[] }
  | { OR: Filter[] };

function isFilter(value: unknown, depth = 0): value is Filter {
  if (!isJsonRecord(value) || depth > 3) return false;
  if ('AND' in value || 'OR' in value) {
    if ('AND' in value && 'OR' in value) return false;
    const entries = value.AND ?? value.OR;
    return (
      Array.isArray(entries) &&
      entries.length > 0 &&
      entries.length <= 4 &&
      entries.every((entry) => isFilter(entry, depth + 1))
    );
  }
  return (
    value.filterType === 'metadata' &&
    typeof value.key === 'string' &&
    value.key.length <= 100 &&
    (typeof value.value === 'string' ||
      typeof value.value === 'number' ||
      typeof value.value === 'boolean')
  );
}

export function matchesFilter(
  metadata: unknown,
  filter: Filter | undefined
): boolean {
  if (filter === undefined) return true;
  if (!isJsonRecord(metadata)) return false;
  if ('AND' in filter)
    return filter.AND.every((child) => matchesFilter(metadata, child));
  if ('OR' in filter)
    return filter.OR.some((child) => matchesFilter(metadata, child));
  const value = metadata[filter.key];
  return Array.isArray(value)
    ? value.includes(filter.value)
    : value === filter.value;
}
