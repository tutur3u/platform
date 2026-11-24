import { z } from 'zod';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/u;
const cursorSchema = z.tuple([
  z.string().regex(TIMESTAMP),
  z.string().regex(/^[0-9a-f-]{36}$/iu),
]);

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

export type PageCursor = { at: string; id: string };

/** Opaque keyset cursor over (timestamp, id). */
export function encodeCursor(cursor: PageCursor) {
  return Buffer.from(JSON.stringify([cursor.at, cursor.id])).toString(
    'base64url'
  );
}

/** Returns null for anything that is not a cursor this module produced. */
export function decodeCursor(value: string | null): PageCursor | null {
  if (!value) return null;
  try {
    const parsed = cursorSchema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    );
    return { at: parsed[0], id: parsed[1] };
  } catch {
    return null;
  }
}

export const pageQuerySchema = z.object({
  cursor: z.string().max(512).nullish(),
  limit: z
    .string()
    .nullish()
    .transform((value) =>
      value ? Number.parseInt(value, 10) : DEFAULT_PAGE_SIZE
    )
    .pipe(z.number().int().min(1).max(MAX_PAGE_SIZE)),
});

/**
 * PostgREST `or` filter selecting rows strictly after (asc) or before (desc)
 * the cursor. Both parts are validated by decodeCursor, so quoting is safe.
 */
export function keysetFilter(
  column: string,
  cursor: PageCursor,
  direction: 'asc' | 'desc'
) {
  const op = direction === 'asc' ? 'gt' : 'lt';
  return `${column}.${op}."${cursor.at}",and(${column}.eq."${cursor.at}",id.${op}.${cursor.id})`;
}
