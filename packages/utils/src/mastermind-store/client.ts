/**
 * Typed client for the Mastermind store Worker. One attempt per call, no
 * retries, a short timeout and no redirects; every failure throws
 * `MastermindStoreUnavailableError` so callers decide how to fail.
 */
import {
  MASTERMIND_STORE_PROTOCOL_VERSION,
  type StoreErrorCode,
  type StoreOp,
  storeRpcResponseSchema,
} from './protocol';

export class MastermindStoreUnavailableError extends Error {
  constructor(
    readonly code: StoreErrorCode | 'timeout' | 'network' | 'invalid_response'
  ) {
    super(`Mastermind store unavailable: ${code}`);
    this.name = 'MastermindStoreUnavailableError';
  }
}

/** The atomic key-value operations the fleet and push-event code use. */
export interface MastermindStore {
  get(key: string, options?: { cacheMs?: number }): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  set(
    key: string,
    value: string,
    options: { ttlMs: number; nx?: boolean }
  ): Promise<boolean>;
  compareAndSet(
    key: string,
    expect: string | null,
    value: string,
    ttlMs: number
  ): Promise<boolean>;
  compareAndDelete(key: string, expect: string): Promise<boolean>;
  del(key: string): Promise<boolean>;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export function createMastermindStoreClient(options: {
  url: string;
  token: string;
  fetch?: Fetch;
  timeoutMs?: number;
}): MastermindStore {
  const endpoint = new URL('/v1/ops', options.url).toString();
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 4000;

  async function run(ops: StoreOp[]) {
    let response: Response;
    try {
      response = await doFetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ v: MASTERMIND_STORE_PROTOCOL_VERSION, ops }),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new MastermindStoreUnavailableError(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'timeout'
          : 'network'
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MastermindStoreUnavailableError('invalid_response');
    }
    const parsed = storeRpcResponseSchema.safeParse(body);
    if (!parsed.success)
      throw new MastermindStoreUnavailableError('invalid_response');
    if (!parsed.data.ok)
      throw new MastermindStoreUnavailableError(parsed.data.error);
    if (parsed.data.results.length !== ops.length)
      throw new MastermindStoreUnavailableError('invalid_response');
    return parsed.data.results;
  }

  const one = async (op: StoreOp) => (await run([op]))[0];
  const asBool = (value: unknown) => {
    if (typeof value !== 'boolean')
      throw new MastermindStoreUnavailableError('invalid_response');
    return value;
  };

  return {
    async get(key, getOptions) {
      const value = await one({
        op: 'get',
        k: key,
        ...(getOptions?.cacheMs ? { cacheMs: getOptions.cacheMs } : {}),
      });
      if (value !== null && typeof value !== 'string')
        throw new MastermindStoreUnavailableError('invalid_response');
      return value;
    },
    async mget(keys) {
      const value = await one({ op: 'mget', ks: keys });
      if (!Array.isArray(value) || value.length !== keys.length)
        throw new MastermindStoreUnavailableError('invalid_response');
      return value;
    },
    async set(key, value, setOptions) {
      return asBool(
        await one({
          op: 'set',
          k: key,
          v: value,
          ttlMs: setOptions.ttlMs,
          mode: setOptions.nx ? 'nx' : 'always',
        })
      );
    },
    async compareAndSet(key, expect, value, ttlMs) {
      return asBool(await one({ op: 'cas', k: key, expect, v: value, ttlMs }));
    },
    async compareAndDelete(key, expect) {
      return asBool(await one({ op: 'cad', k: key, expect }));
    },
    async del(key) {
      return asBool(await one({ op: 'del', k: key }));
    },
  };
}

/** The configured client, or null when either variable is missing. */
export function configuredMastermindStore(
  env: Record<string, string | undefined> = process.env
): MastermindStore | null {
  const url = env.MASTERMIND_STORE_URL?.trim();
  const token = env.MASTERMIND_STORE_TOKEN?.trim();
  if (!url || !token || token.length < 32) return null;
  try {
    const parsed = new URL(url);
    const loopback =
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
    if (parsed.protocol !== 'https:' && !loopback) return null;
  } catch {
    return null;
  }
  return createMastermindStoreClient({ url, token });
}

/**
 * In-memory store with the Worker's semantics, for tests and local runs
 * without the Worker. Not for production use.
 */
export function createMemoryMastermindStore(
  now: () => number = Date.now
): MastermindStore & { size(): number } {
  const rows = new Map<string, { v: string; exp: number }>();
  const live = (key: string) => {
    const row = rows.get(key);
    if (!row) return null;
    if (row.exp <= now()) {
      rows.delete(key);
      return null;
    }
    return row;
  };
  return {
    size: () => rows.size,
    async get(key) {
      return live(key)?.v ?? null;
    },
    async mget(keys) {
      return keys.map((key) => live(key)?.v ?? null);
    },
    async set(key, value, options) {
      if (options.nx && live(key)) return false;
      rows.set(key, { v: value, exp: now() + options.ttlMs });
      return true;
    },
    async compareAndSet(key, expect, value, ttlMs) {
      if ((live(key)?.v ?? null) !== expect) return false;
      rows.set(key, { v: value, exp: now() + ttlMs });
      return true;
    },
    async compareAndDelete(key, expect) {
      if (live(key)?.v !== expect) return false;
      rows.delete(key);
      return true;
    },
    async del(key) {
      return rows.delete(key);
    },
  };
}
