type PageResult<T> = PromiseLike<{
  data: T[] | null;
  error: { code?: string | null; message?: string | null } | null;
}>;

/** PostgREST `max_rows` (1000): one response never holds more rows. */
export const FEE_LOCK_PAGE_SIZE = 1000;

/** Reads every row of a query by paging with `.range()`; the query must have a stable order. */
export async function readAllPages<T>(
  page: (from: number, to: number) => PageResult<T>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += FEE_LOCK_PAGE_SIZE) {
    const { data, error } = await page(from, from + FEE_LOCK_PAGE_SIZE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < FEE_LOCK_PAGE_SIZE) return { rows, error: null };
  }
}

/** `readAllPages` over `.in()` chunks of ids, so long id lists stay within URL limits. */
export async function readAllInChunks<T>(
  ids: string[],
  page: (chunk: string[], from: number, to: number) => PageResult<T>,
  chunkSize = 200
) {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += chunkSize) {
    const chunk = ids.slice(start, start + chunkSize);
    const result = await readAllPages((from, to) => page(chunk, from, to));
    if (result.error) return { rows, error: result.error };
    rows.push(...result.rows);
  }
  return { rows, error: null };
}
