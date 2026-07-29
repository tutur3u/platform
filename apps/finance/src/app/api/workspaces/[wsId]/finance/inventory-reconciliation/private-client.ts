import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type QueryError = { message?: string } | null;
type QueryResult<T> = { data: T[] | null; error: QueryError };
type SingleQueryResult<T> = { data: T | null; error: QueryError };

export type PrivateQuery<T> = PromiseLike<QueryResult<T>> & {
  eq(column: string, value: unknown): PrivateQuery<T>;
  gte(column: string, value: unknown): PrivateQuery<T>;
  in(column: string, values: readonly unknown[]): PrivateQuery<T>;
  limit(value: number): PrivateQuery<T>;
  lte(column: string, value: unknown): PrivateQuery<T>;
  maybeSingle(): PromiseLike<SingleQueryResult<T>>;
  or(filters: string): PrivateQuery<T>;
  order(column: string, options?: { ascending?: boolean }): PrivateQuery<T>;
  select(columns?: string): PrivateQuery<T>;
  upsert(
    values: unknown,
    options?: { onConflict?: string }
  ): PromiseLike<QueryResult<T>>;
};

export type PrivateFinanceDataClient = {
  from<T>(table: string): PrivateQuery<T>;
  rpc<T>(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: T[] | null; error: QueryError }>;
};

export function privateFinanceDataClient(
  sbAdmin: TypedSupabaseClient
): PrivateFinanceDataClient {
  return sbAdmin.schema('private') as unknown as PrivateFinanceDataClient;
}
