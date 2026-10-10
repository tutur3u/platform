import { vi } from 'vitest';

export type PagingRow = Record<
  string,
  string | number | boolean | null | number[]
>;

/** Models PostgREST filtering/ordering before its inclusive range + max_rows cap. */
export function cappedSessionDatabase(
  tables: Record<string, PagingRow[]>,
  fail = false,
  options: {
    cap?: number;
    lateError?: boolean;
    missingCount?: boolean;
    countDrift?: boolean;
    duplicate?: boolean;
    reverse?: boolean;
    countOverride?: number;
  } = {}
) {
  const reads: {
    table: string;
    start: number;
    count: number;
    total: number;
  }[] = [];
  const writes = vi.fn(() => {
    throw new Error('Unexpected synthetic write');
  });
  const from = (table: string) => {
    const filters: ((row: PagingRow) => boolean)[] = [];
    const orders: { key: string; ascending: boolean }[] = [];
    let exact = false,
      cursor = false;
    let start = 0,
      end = 999;
    const builder = {
      select: (_columns: string, config?: { count?: string }) => {
        exact = config?.count === 'exact';
        return builder;
      },
      gt: (key: string, value: string) => {
        cursor = true;
        filters.push((row) => String(row[key]) > value);
        return builder;
      },
      eq: (key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return builder;
      },
      in: (key: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[key]));
        return builder;
      },
      gte: (key: string, value: string) => {
        filters.push((row) => String(row[key]) >= value);
        return builder;
      },
      lte: (key: string, value: string) => {
        filters.push((row) => String(row[key]) <= value);
        return builder;
      },
      order: (key: string, options?: { ascending?: boolean }) => {
        orders.push({ key, ascending: options?.ascending !== false });
        return builder;
      },
      range: (first: number, last: number) => {
        start = first;
        end = last;
        return builder;
      },
      insert: writes,
      update: writes,
      delete: writes,
      upsert: writes,
      // biome-ignore lint/suspicious/noThenProperty: Actual Supabase queries are thenable.
      then: (
        resolve: (value: {
          data: PagingRow[] | null;
          error: { message: string } | null;
          count: number | null;
        }) => unknown
      ) => {
        const selected = (tables[table] ?? []).filter((row) =>
          filters.every((filter) => filter(row))
        );
        selected.sort((a, b) => {
          for (const order of orders) {
            const difference = String(a[order.key]).localeCompare(
              String(b[order.key])
            );
            if (difference) return order.ascending ? difference : -difference;
          }
          return 0;
        });
        const data = selected.slice(
          start,
          Math.min(end + 1, start + (options.cap ?? 1000))
        );
        if (options.reverse) data.reverse();
        if (options.duplicate && data.length > 1) data[1] = data[0]!;
        const failed = fail || (cursor && options.lateError);
        reads.push({
          table,
          start,
          count: data.length,
          total: selected.length,
        });
        return Promise.resolve({
          data: failed ? null : data,
          error: failed ? { message: 'Synthetic private error' } : null,
          count:
            !exact || options.missingCount
              ? null
              : (options.countOverride ??
                selected.length + (cursor && options.countDrift ? 1 : 0)),
        }).then(resolve);
      },
    };
    return builder;
  };
  return { supabase: { from, schema: () => ({ from }) }, reads, writes };
}
