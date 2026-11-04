/**
 * Redis-shaped view over the abuse-guard store for callers written against the
 * Upstash REST client. Values keep Upstash's automatic (de)serialization:
 * strings are stored as-is, other values as JSON, and reads parse JSON when
 * possible. SCAN is not available; administrative listings report that.
 */
import type { AbuseGuardClient } from './client';

/** Keys created without a TTL (INCR before EXPIRE) expire after seven days. */
export const GUARD_VIEW_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GuardRedisSetOptions = {
  ex?: number;
  px?: number;
  nx?: boolean;
  xx?: boolean;
  keepTtl?: boolean;
};

export class GuardScanUnsupportedError extends Error {
  constructor() {
    super('SCAN is not supported by the abuse-guard store');
    this.name = 'GuardScanUnsupportedError';
  }
}

function encode(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function decode<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

function ttlMsOf(options: GuardRedisSetOptions | undefined) {
  if (options?.px !== undefined) return options.px;
  if (options?.ex !== undefined) return options.ex * 1000;
  return GUARD_VIEW_DEFAULT_TTL_MS;
}

export function createGuardRedisView(
  client: Pick<
    AbuseGuardClient,
    'get' | 'mget' | 'set' | 'del' | 'incr' | 'expire' | 'ttl'
  >
) {
  return {
    async get<T = unknown>(key: string) {
      return decode<T>(await client.get(key));
    },
    async mget<T = unknown>(...keys: (string | string[])[]) {
      return (await client.mget(keys.flat())).map((raw) => decode<T>(raw));
    },
    async set(key: string, value: unknown, options?: GuardRedisSetOptions) {
      const stored = await client.set(key, encode(value), {
        ttlMs: ttlMsOf(options),
        mode: options?.nx ? 'nx' : options?.xx ? 'xx' : 'always',
        keepTtl: options?.keepTtl,
      });
      return stored ? ('OK' as const) : null;
    },
    async del(...keys: string[]) {
      return client.del(keys);
    },
    async incr(key: string) {
      return (await client.incr(key, 1, GUARD_VIEW_DEFAULT_TTL_MS)).n;
    },
    async decr(key: string) {
      return (await client.incr(key, -1, GUARD_VIEW_DEFAULT_TTL_MS)).n;
    },
    async expire(key: string, seconds: number) {
      return (await client.expire(key, seconds * 1000)) ? 1 : 0;
    },
    /** Seconds remaining, or -2 when absent (no key is ever persistent). */
    async ttl(key: string) {
      const ms = await client.ttl(key);
      return ms < 0 ? ms : Math.ceil(ms / 1000);
    },
    async scan(): Promise<never> {
      throw new GuardScanUnsupportedError();
    },
  };
}

export type GuardRedisView = ReturnType<typeof createGuardRedisView>;
