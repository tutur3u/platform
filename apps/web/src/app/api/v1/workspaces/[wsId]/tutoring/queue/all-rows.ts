/**
 * PostgREST silently caps every select at `max_rows` (1000 on hosted
 * Supabase), so a workspace-wide read must page until a short page arrives.
 * Callers must order by a unique key so pages neither skip nor repeat rows.
 * A read that never ends fails after `maxPages` instead of looping forever.
 */
export const QUEUE_READ_PAGE_SIZE = 1000;
export const READ_ALL_MAX_PAGES = 200;

export async function readAllRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = QUEUE_READ_PAGE_SIZE,
  maxPages = READ_ALL_MAX_PAGES
): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data, error: result.error };
    const rows = result.data ?? [];
    data.push(...rows);
    if (rows.length < pageSize) return { data, error: null };
  }
  return { data, error: new Error(`Read exceeded ${maxPages} pages`) };
}

/**
 * Reads rows by id in chunks: each chunk stays under the row cap and keeps
 * the `in` filter short enough for the request URL.
 */
export async function readByIds<T>(
  ids: string[],
  fetchChunk: (
    chunk: string[]
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize = 200
): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  for (let start = 0; start < ids.length; start += chunkSize) {
    const result = await fetchChunk(ids.slice(start, start + chunkSize));
    if (result.error) return { data, error: result.error };
    data.push(...(result.data ?? []));
  }
  return { data, error: null };
}
