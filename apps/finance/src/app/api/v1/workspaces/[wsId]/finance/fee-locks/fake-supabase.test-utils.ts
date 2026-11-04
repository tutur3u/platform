import { vi } from 'vitest';

type Result = { data?: unknown; error?: unknown };

/** Admin-client fake: `from(table)` chains resolve to `tables[table]`, filters are recorded, `rpc(fn)` resolves to `rpc[fn]`. */
export function fakeSupabase(
  tables: Record<string, Result> = {},
  rpc: Record<string, Result> = {}
) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];
  const builder = (table: string): unknown => {
    const result = Promise.resolve({
      data: null,
      error: null,
      ...tables[table],
    });
    const chain: unknown = new Proxy(
      {},
      {
        get(_, method) {
          if (method === 'then') return result.then.bind(result);
          if (method === 'maybeSingle' || method === 'single') {
            return () => result;
          }
          return (...args: unknown[]) => {
            calls.push({ table, method: String(method), args });
            return chain;
          };
        },
      }
    );
    return chain;
  };
  const callRpc = vi.fn(async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    return { data: null, error: null, ...rpc[fn] };
  });
  const client = {
    from: vi.fn(builder),
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
