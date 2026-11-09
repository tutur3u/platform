import { vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

/**
 * Admin-client fake: `from(table)` and `rpc(fn)` chains resolve to `tables[table]` / `rpc[fn]`,
 * sliced by `.range()` and capped at 1000 rows like PostgREST max_rows; filters are recorded.
 */
export function fakeSupabase(
  tables: Record<string, Result> = {},
  rpc: Record<string, Result> = {}
) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const builder = (table: string, source: Result | undefined): unknown => {
    let range: [number, number] | null = null;
    const resolve = () => {
      const base = { data: null as unknown, error: null, ...source };
      // PostgREST max_rows: an unranged response holds at most 1000 rows.
      const [from, to] = range ?? [0, 999];
      return Array.isArray(base.data)
        ? { ...base, data: base.data.slice(from, to + 1) }
        : base;
    };
    const chain: unknown = new Proxy(
      {},
      {
        get(_, method) {
          if (method === 'then') {
            return (
              ok: (v: unknown) => unknown,
              ko?: (e: unknown) => unknown
            ) => Promise.resolve(resolve()).then(ok, ko);
          }
          if (method === 'maybeSingle' || method === 'single') {
            return () => Promise.resolve(resolve());
          }
          return (...args: unknown[]) => {
            calls.push({ table, method: String(method), args });
            if (method === 'range')
              range = [args[0] as number, args[1] as number];
            return chain;
          };
        },
      }
    );
    return chain;
  };
  const callRpc = vi.fn((fn: string, args: unknown): unknown => {
    rpcCalls.push({ fn, args });
    return builder(`rpc:${fn}`, rpc[fn]);
  });
  const client = {
    from: vi.fn((table: string) => builder(table, tables[table])),
    rpc: callRpc,
    schema: vi.fn(() => ({ rpc: callRpc })),
  };
  const filtered = (table: string, column: string, value: unknown) =>
    calls.some(
      (call) =>
        call.table === table &&
        call.method === 'eq' &&
        call.args[0] === column &&
        call.args[1] === value
    );
  return { client, calls, rpcCalls, filtered };
}
