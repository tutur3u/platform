import { Buffer } from 'node:buffer';
import { Effect } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { StaffReadError } from './staff-access';

const uuid = z.uuid().transform((value) => value.toLowerCase());
const timestamp = z.iso
  .datetime({ offset: true })
  .refine((value) => !/\.\d{7}/.test(value));
function micros(value: string) {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? '';
  return (
    BigInt(Math.floor(Date.parse(value) / 1000)) * 1000000n +
    BigInt(fraction.padEnd(6, '0'))
  );
}
const filters = z.object({
  view: z.enum(['inbox', 'resolved', 'archive', 'all']),
  status: z.enum(['open', 'resolved']).nullable(),
  q: z
    .string()
    .refine(
      (value) =>
        Array.from(value).length <= 160 &&
        !Array.from(value).some(
          (char) => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127
        )
    ),
});
const position = z.object({ createdAt: timestamp, id: uuid }).strict();
const MAX_CURSOR_BYTES = 1152;
const cursorSchema = filters
  .extend({ v: z.literal(1), ...position.shape })
  .strict();
export type StaffFilters = z.infer<typeof filters>;
export type StaffQuery = StaffFilters & {
  limit: number;
  before: z.infer<typeof position> | null;
};
const itemSchema = z
  .object({
    id: uuid,
    title: z
      .string()
      .refine((v) => Array.from(v).length >= 1 && Array.from(v).length <= 160),
    createdAt: timestamp,
    status: z.enum(['open', 'resolved']),
    archivedAt: timestamp.nullable(),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const detailSchema = itemSchema
  .extend({
    body: z
      .string()
      .refine(
        (value) =>
          Array.from(value).length >= 1 && Array.from(value).length <= 8000
      ),
    updatedAt: timestamp,
    capabilities: z.object({ canManage: z.literal(false) }).strict(),
  })
  .strict();
const listSchema = z.object({ items: z.array(itemSchema).max(51) }).strict();
export interface StaffReadDependencies {
  actor: (request: Request) => Promise<string>;
  enabled: () => boolean;
  list: (actor: string, query: StaffQuery) => Promise<unknown>;
  detail: (actor: string, id: string) => Promise<unknown>;
}
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};
const failure = (status: number) =>
  Response.json(
    {
      error: {
        code:
          status === 401
            ? 'feedback_unauthorized'
            : status === 403
              ? 'feedback_forbidden'
              : status === 400
                ? 'feedback_invalid_query'
                : status === 404
                  ? 'feedback_not_found'
                  : 'feedback_unavailable',
      },
    },
    { status, headers }
  );
function encodeCursor(query: StaffFilters, last: z.infer<typeof position>) {
  return Buffer.from(JSON.stringify({ v: 1, ...query, ...last })).toString(
    'base64url'
  );
}
export function parseStaffQuery(url: string): StaffQuery {
  const params = new URL(url).searchParams;
  const allowed = ['view', 'status', 'q', 'limit', 'cursor'];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1)
      throw new Error('invalid_query');
  }
  const query = filters.parse({
    view: params.get('view') ?? 'inbox',
    status: params.get('status'),
    q: (params.get('q') ?? '').trim(),
  });
  if (query.status !== null && !['archive', 'all'].includes(query.view))
    throw new Error('invalid_query');
  const rawLimit = params.get('limit') ?? '25';
  if (!/^[1-9]\d?$/.test(rawLimit)) throw new Error('invalid_query');
  const limit = Number(rawLimit);
  if (limit > 50) throw new Error('invalid_query');
  const raw = params.get('cursor');
  let before: StaffQuery['before'] = null;
  if (raw !== null) {
    if (
      Buffer.byteLength(raw, 'utf8') > MAX_CURSOR_BYTES ||
      !/^[A-Za-z0-9_-]+$/.test(raw)
    )
      throw new Error('invalid_cursor');
    const decoded = Buffer.from(raw, 'base64url');
    if (decoded.toString('base64url') !== raw)
      throw new Error('invalid_cursor');
    const cursor = cursorSchema.parse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded))
    );
    if (
      cursor.view !== query.view ||
      cursor.status !== query.status ||
      cursor.q !== query.q
    )
      throw new Error('invalid_cursor');
    before = { createdAt: cursor.createdAt, id: cursor.id };
  }
  return { ...query, limit, before };
}
async function attempt<T>(run: () => Promise<T>) {
  return Effect.runPromise(
    Effect.tryPromise({ try: run, catch: (error) => error }).pipe(
      Effect.match({
        onFailure: (error) => ({ ok: false as const, error }),
        onSuccess: (value) => ({ ok: true as const, value }),
      })
    )
  );
}
async function admit(
  request: Request,
  deps: StaffReadDependencies
): Promise<{ response: Response } | { actor: string }> {
  const result = await attempt(() => deps.actor(request));
  if (!result.ok)
    return {
      response: failure(
        result.error instanceof StaffReadError ? result.error.status : 503
      ),
    };
  if (!deps.enabled()) return { response: failure(503) };
  return { actor: result.value };
}
export function createStaffListHandler(deps: StaffReadDependencies) {
  return async (request: Request) => {
    const admission = await admit(request, deps);
    if ('response' in admission) return admission.response;
    let query: StaffQuery;
    try {
      query = parseStaffQuery(request.url);
    } catch {
      return failure(400);
    }
    const result = await attempt(async () =>
      listSchema.parse(await deps.list(admission.actor, query))
    );
    if (!result.ok)
      return failure(
        result.error instanceof StaffReadError ? result.error.status : 503
      );
    const rows = result.value.items;
    // Reject malformed store ordering/membership rather than producing a broken cursor.
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const previous = rows[i - 1];
      const before = previous ?? query.before;
      if (
        (before &&
          !(
            micros(row.createdAt) < micros(before.createdAt) ||
            (micros(row.createdAt) === micros(before.createdAt) &&
              row.id < before.id)
          )) ||
        (query.view === 'inbox' &&
          (row.status !== 'open' || row.archivedAt !== null)) ||
        (query.view === 'resolved' &&
          (row.status !== 'resolved' || row.archivedAt !== null)) ||
        (query.view === 'archive' && row.archivedAt === null) ||
        (query.status !== null && row.status !== query.status)
      )
        return failure(503);
    }
    if (rows.length > query.limit + 1) return failure(503);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor =
      rows.length > query.limit && last
        ? encodeCursor(
            { view: query.view, status: query.status, q: query.q },
            { createdAt: last.createdAt, id: last.id }
          )
        : null;
    // Never issue a cursor that the strict parser cannot accept.
    if (
      nextCursor !== null &&
      Buffer.byteLength(nextCursor, 'utf8') > MAX_CURSOR_BYTES
    )
      return failure(503);
    return Response.json({ items, nextCursor }, { headers });
  };
}
export function createStaffDetailHandler(deps: StaffReadDependencies) {
  return async (request: Request, id: string) => {
    const admission = await admit(request, deps);
    if ('response' in admission) return admission.response;
    const parsed = uuid.safeParse(id);
    if (!parsed.success || new URL(request.url).search) return failure(400);
    const result = await attempt(async () => {
      const raw = await deps.detail(admission.actor, parsed.data);
      if (raw === null) return null;
      const detail = detailSchema.parse(raw);
      if (detail.id !== parsed.data) throw new Error('invalid_detail_identity');
      return detail;
    });
    if (!result.ok)
      return failure(
        result.error instanceof StaffReadError ? result.error.status : 503
      );
    return result.value === null
      ? failure(404)
      : Response.json(result.value, { headers });
  };
}
