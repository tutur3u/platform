/**
 * Minimal recording Supabase query fake for route tests. Every `from(table)`
 * call is recorded with its chained filter calls, and the query resolves
 * through `resolve` once awaited so tests can answer by table and filters.
 */
export interface FakeQueryOp {
  method: string;
  args: unknown[];
}

export interface FakeQueryCall {
  table: string;
  ops: FakeQueryOp[];
}

export interface FakeQueryResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export function createFakeSupabase(
  resolve: (call: FakeQueryCall) => FakeQueryResult
) {
  const calls: FakeQueryCall[] = [];

  const settle = (call: FakeQueryCall) => {
    const result = resolve(call);
    return Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null,
    });
  };

  const client = {
    from(table: string) {
      const call: FakeQueryCall = { table, ops: [] };
      calls.push(call);

      const builder: object = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'then') {
              const settled = settle(call);
              return settled.then.bind(settled);
            }
            if (prop === 'maybeSingle' || prop === 'single') {
              return () => {
                call.ops.push({ method: prop, args: [] });
                return settle(call);
              };
            }
            return (...args: unknown[]) => {
              call.ops.push({ method: String(prop), args });
              return builder;
            };
          },
        }
      );
      return builder;
    },
  };

  return {
    client: client as any,
    calls,
    tables: () => calls.map((call) => call.table),
  };
}

/** Returns the value passed to `.eq(column, value)` on a recorded call. */
export function eqValue(call: FakeQueryCall, column: string) {
  return call.ops.find((op) => op.method === 'eq' && op.args[0] === column)
    ?.args[1];
}

/** Returns the values passed to `.in(column, values)` on a recorded call. */
export function inValues(call: FakeQueryCall, column: string) {
  return call.ops.find((op) => op.method === 'in' && op.args[0] === column)
    ?.args[1] as unknown[] | undefined;
}
