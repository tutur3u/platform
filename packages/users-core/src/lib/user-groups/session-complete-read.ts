import 'server-only';

const PAGE_SIZE = 500;
const MAX_ROWS = 10_000;
const MAX_PAGES = 20;
export const INCOMPLETE_SESSION_READ = 'Session preview read is incomplete';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Row = { id: string };
type Page<T> = { data: T[] | null; error: unknown; count?: number | null };
type Query<T> = PromiseLike<Page<T>> & {
  order: (column: string, options: { ascending: boolean }) => Query<T>;
  gt: (column: string, value: string) => Query<T>;
  range: (from: number, to: number) => Query<T>;
};

/** Statement-level reads: exact counts detect truncation/drift, not a DB snapshot. */
export async function completeSessionRead<T extends Row>(
  query: () => Query<T>
) {
  const fail = () => {
    throw new Error(INCOMPLETE_SESSION_READ);
  };
  const rows: T[] = [];
  const seen = new Set<string>();
  let total: number | undefined;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    let request = query()
      .order('id', { ascending: true })
      .range(0, PAGE_SIZE - 1);
    if (cursor) request = request.gt('id', cursor);
    let result: Page<T>;
    try {
      result = await request;
    } catch {
      return fail();
    }
    if (
      result.error ||
      !Array.isArray(result.data) ||
      !Number.isSafeInteger(result.count) ||
      result.count === null ||
      result.count === undefined ||
      result.count < 0
    )
      return fail();
    total ??= result.count;
    if (
      total > MAX_ROWS ||
      result.count !== total - rows.length ||
      result.data.length !== Math.min(PAGE_SIZE, result.count)
    )
      return fail();
    for (const row of result.data) {
      if (
        typeof row.id !== 'string' ||
        !UUID.test(row.id) ||
        seen.has(row.id) ||
        (cursor !== undefined && row.id <= cursor)
      )
        return fail();
      seen.add(row.id);
      cursor = row.id;
      rows.push(row);
    }
    if (rows.length === total) return { data: rows, error: null };
  }
  return fail();
}
