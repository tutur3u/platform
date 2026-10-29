/**
 * PostgREST silently caps every select at `max_rows` (1000 on hosted
 * Supabase), so a workspace-wide read must page until a short page arrives.
 * Callers must order by a unique key so pages neither skip nor repeat rows.
 */
export const QUEUE_READ_PAGE_SIZE = 1000;

export async function readAllRows<T>(
  fetchPage: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = QUEUE_READ_PAGE_SIZE
): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (page.error) return { data, error: page.error };
    const rows = page.data ?? [];
    data.push(...rows);
    if (rows.length < pageSize) return { data, error: null };
  }
}
