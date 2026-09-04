import { vi } from 'vitest';

export interface QueryResult {
  count?: number | null;
  data: unknown;
  error: unknown;
}

type QueryOperation = 'delete' | 'insert' | 'select' | 'update';

export type TableResults = Record<
  string,
  Partial<Record<QueryOperation, QueryResult>>
>;

export function createAdminSupabaseMock(results: TableResults) {
  const queries = new Map<string, ReturnType<typeof createQueryMock>[]>();
  const from = vi.fn((table: string) => {
    const query = createQueryMock(results[table] ?? {});
    queries.set(table, [...(queries.get(table) ?? []), query]);
    return query;
  });

  return {
    client: { from },
    from,
    queries,
  };
}

function createQueryMock(
  results: Partial<Record<QueryOperation, QueryResult>>
) {
  let operation: QueryOperation | undefined;
  const fallback = { data: null, error: null } satisfies QueryResult;
  const currentResult = () => results[operation ?? 'select'] ?? fallback;

  const query = {
    delete: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    in: vi.fn(),
    insert: vi.fn(),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    select: vi.fn(),
    single: vi.fn(),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
    then: vi.fn(),
    update: vi.fn(),
  };

  query.delete.mockImplementation(() => {
    operation = 'delete';
    return query;
  });
  query.insert.mockImplementation(() => {
    operation = 'insert';
    return query;
  });
  query.update.mockImplementation(() => {
    operation = 'update';
    return query;
  });
  query.select.mockImplementation(() => {
    operation ??= 'select';
    return query;
  });

  for (const method of [
    query.eq,
    query.ilike,
    query.in,
    query.order,
    query.range,
  ]) {
    method.mockReturnValue(query);
  }

  query.single.mockImplementation(async () => currentResult());
  query.maybeSingle.mockImplementation(async () => currentResult());
  query.then.mockImplementation(
    (
      onFulfilled: (result: QueryResult) => unknown,
      onRejected?: (error: unknown) => unknown
    ) => Promise.resolve(currentResult()).then(onFulfilled, onRejected)
  );

  return query;
}
