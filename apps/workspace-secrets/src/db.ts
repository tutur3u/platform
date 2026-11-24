/**
 * The Worker's only database path: Supabase REST calls to the step-1 definer
 * RPCs with the service key, which is referenced by binding name only.
 * Every call is idempotent (puts carry a request id), so a transport failure
 * or 5xx is retried at most twice; nothing else is retried. Errors name the
 * RPC and HTTP status, never a request or response body.
 */

export interface DbEnv {
  SUPABASE_URL?: unknown;
  SUPABASE_SECRET_KEY?: unknown;
}

export class DbError extends Error {
  constructor(
    readonly code: 'db_config' | 'db_unavailable' | 'db_rejected',
    readonly rpc: string,
    readonly status?: number
  ) {
    super(`${code}:${rpc}${status ? `:${status}` : ''}`);
    this.name = 'DbError';
  }
}

export const DB_MAX_ATTEMPTS = 3;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function toByteaHex(bytes: Uint8Array): string {
  let hex = '\\x';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export function fromByteaHex(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !/^\\x(?:[0-9a-f]{2})*$/iu.test(value)) {
    throw new DbError('db_rejected', 'bytea');
  }
  const out = new Uint8Array((value.length - 2) / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(value.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return out;
}

export function createDb(
  env: DbEnv,
  fetchImpl: FetchLike = fetch,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms))
) {
  const url =
    typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim() : '';
  const key =
    typeof env.SUPABASE_SECRET_KEY === 'string'
      ? env.SUPABASE_SECRET_KEY.trim()
      : '';

  async function rpc<T>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    if (!/^https:\/\/[^/]+$/u.test(url.replace(/\/$/u, '')) || !key) {
      throw new DbError('db_config', name);
    }
    const endpoint = `${url.replace(/\/$/u, '')}/rest/v1/rpc/${name}`;
    for (let attempt = 1; attempt <= DB_MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          body: JSON.stringify(args),
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          redirect: 'manual',
        });
      } catch {
        if (attempt === DB_MAX_ATTEMPTS)
          throw new DbError('db_unavailable', name);
        await sleep(50 * attempt);
        continue;
      }
      if (response.ok) return (await response.json()) as T;
      // Drain without reading the body into an error.
      await response.body?.cancel();
      if (response.status >= 500 && attempt < DB_MAX_ATTEMPTS) {
        await sleep(50 * attempt);
        continue;
      }
      throw new DbError(
        response.status >= 500 ? 'db_unavailable' : 'db_rejected',
        name,
        response.status
      );
    }
    throw new DbError('db_unavailable', name);
  }

  return { rpc };
}

export type Db = ReturnType<typeof createDb>;
