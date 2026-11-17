/**
 * Test doubles for the current-user reads. `memorySupabase` behaves like an
 * admin-backed client: it applies only the filters a query states, so a read
 * that forgets to filter by the actor returns other users' rows.
 */

export type Row = Record<string, unknown>;
export type MemoryDb = Record<string, Row[]>;
export type QueryLog = Array<{
  args: unknown[];
  method: string;
  table: string;
}>;

type Result = { data: unknown; error: unknown };

/** A chainable query that records its calls and resolves to `result`. */
export function fakeQuery(result: Result, log?: QueryLog, table = 'table') {
  const builder: unknown = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return (
            resolve: (value: Result) => unknown,
            reject: (reason: unknown) => unknown
          ) => Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          log?.push({ args, method: String(property), table });
          return builder;
        };
      },
    }
  );
  return builder;
}

function likeToRegExp(pattern: string) {
  const source = pattern
    .replace(/[.*+?^${}()|[\]]/g, '\\$&')
    .replace(/\\_/g, '\u0000')
    .replace(/_/g, '.')
    .replace(/\u0000/g, '_')
    .replace(/%/g, '.*');
  return new RegExp(`^${source}$`);
}

/**
 * Minimal in-memory PostgREST stand-in. Supports `eq`, `in`, `like`, `is`,
 * `or` (ignored), `order`, `limit` and the `workspace_members.user_id` embedded
 * filter used by the workspace read.
 */
export function memorySupabase(db: MemoryDb, log?: QueryLog) {
  return {
    from(table: string) {
      let rows = (db[table] ?? []).map((row) => ({ ...row }));
      const builder: Record<string, unknown> = {};
      const chain = (method: string, args: unknown[], apply: () => void) => {
        log?.push({ args, method, table });
        apply();
        return builder;
      };
      const settle = (single: boolean) => {
        if (single && rows.length > 1) {
          return { data: null, error: { code: 'PGRST116' } };
        }
        if (single && rows.length === 0) {
          return { data: null, error: { code: 'PGRST116' } };
        }
        return { data: single ? rows[0] : rows, error: null };
      };
      builder.select = (...args: unknown[]) => chain('select', args, () => {});
      builder.eq = (column: string, value: unknown) =>
        chain('eq', [column, value], () => {
          if (column === 'workspace_members.user_id') {
            rows = rows
              .filter((row) =>
                (db.workspace_members ?? []).some(
                  (member) =>
                    member.ws_id === row.id && member.user_id === value
                )
              )
              .map((row) => ({
                ...row,
                workspace_members: [{ user_id: value }],
              }));
            return;
          }
          rows = rows.filter((row) => row[column] === value);
        });
      builder.in = (column: string, values: unknown[]) =>
        chain('in', [column, values], () => {
          rows = rows.filter((row) => values.includes(row[column]));
        });
      builder.like = (column: string, pattern: string) =>
        chain('like', [column, pattern], () => {
          const expression = likeToRegExp(pattern);
          rows = rows.filter((row) => expression.test(String(row[column])));
        });
      builder.is = (column: string, value: unknown) =>
        chain('is', [column, value], () => {
          rows = rows.filter((row) => (row[column] ?? null) === value);
        });
      builder.or = (...args: unknown[]) => chain('or', args, () => {});
      builder.order = (...args: unknown[]) => chain('order', args, () => {});
      builder.limit = (...args: unknown[]) => chain('limit', args, () => {});
      builder.maybeSingle = async () =>
        rows.length > 1
          ? { data: null, error: { code: 'PGRST116' } }
          : { data: rows[0] ?? null, error: null };
      builder.single = async () => settle(true);
      builder.then = (
        resolve: (value: Result) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(settle(false)).then(resolve, reject);
      return builder;
    },
  };
}
