import type { Redis } from '@upstash/redis';
import type { AbuseGuardFamily } from './abuse-guard/protocol';
import { createGuardRedisView } from './abuse-guard/redis-view';
import { selectAbuseGuard } from './abuse-guard/select';

export type UpstashRestRedisClient = Pick<
  Redis,
  | 'decr'
  | 'del'
  | 'eval'
  | 'expire'
  | 'get'
  | 'incr'
  | 'mget'
  | 'scan'
  | 'set'
  | 'ttl'
>;
export type UpstashRatelimitRedisClient = Pick<
  Redis,
  'eval' | 'evalsha' | 'get' | 'set'
>;

export function hasUpstashRestEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

/**
 * Replay-fence cutover: until ABUSE_GUARD_REPLAY_LEGACY_UNTIL (an ISO date set
 * to cutover + the longest refresh-token TTL), fence keys consumed in the
 * legacy Upstash store still count as used, so tokens spent before the cutover
 * cannot be replayed against the new store. Legacy errors fail like store
 * errors (callers fail closed once `replay` is assigned).
 */
function replayLegacyReadsActive(now = Date.now()) {
  const until = Date.parse(
    (typeof process === 'undefined'
      ? undefined
      : process.env.ABUSE_GUARD_REPLAY_LEGACY_UNTIL
    )?.trim() ?? ''
  );
  return Number.isFinite(until) && until > now && hasUpstashRestEnv();
}

type ReplayView = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
  ): Promise<'OK' | null>;
};

export function withLegacyReplayReads<TView extends ReplayView>(
  view: TView,
  legacy: Pick<UpstashRestRedisClient, 'get'>
): TView {
  return {
    ...view,
    async get<T = unknown>(key: string) {
      const current = await view.get<T>(key);
      return current ?? ((await legacy.get<T>(key)) as T | null);
    },
    async set(
      key: string,
      value: unknown,
      options?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
    ) {
      if (options?.nx && (await legacy.get(key)) !== null) return null;
      return view.set(key, value, options);
    },
  };
}

/**
 * Returns the Redis-shaped client for abuse-protection state. A caller that
 * names its `family` is served by the Durable Object guard store once that
 * family is assigned to it, and gets null (store unavailable, so its own fail
 * policy applies) when the assignment is misconfigured or switched off.
 * Without a family, or for an unassigned one, this is the Upstash client.
 */
export async function getUpstashRestRedisClient(options?: {
  family?: AbuseGuardFamily;
}): Promise<UpstashRestRedisClient | null> {
  if (options?.family) {
    const selection = selectAbuseGuard(options.family);
    if (selection.kind === 'off') return null;
    if (selection.kind === 'durable-object') {
      // Covers GET/MGET/SET/DEL/INCR/DECR/EXPIRE/TTL; SCAN throws.
      const view = createGuardRedisView(selection.client);
      const legacy =
        options.family === 'replay' && replayLegacyReadsActive()
          ? await legacyRestClient()
          : null;
      return (legacy
        ? withLegacyReplayReads(view, legacy)
        : view) as unknown as UpstashRestRedisClient;
    }
  }
  return legacyRestClient();
}

async function legacyRestClient(): Promise<UpstashRestRedisClient | null> {
  if (!hasUpstashRestEnv()) {
    return null;
  }

  const { Redis } = await import('@upstash/redis');
  const client = Redis.fromEnv();

  const restClient: UpstashRestRedisClient = {
    del: (...keys) => client.del(...keys),
    decr: (key) => client.decr(key),
    eval: (...args) => client.eval(...args),
    expire: (key, seconds) => client.expire(key, seconds),
    get: <T = unknown>(key: string) => client.get<T>(key),
    incr: (key) => client.incr(key),
    mget: (...args) => client.mget(...args),
    scan: client.scan.bind(client),
    set: (key, value, options) => client.set(key, value, options),
    ttl: (key) => client.ttl(key),
  };

  return restClient;
}

export async function getUpstashRatelimitRedisClient(): Promise<UpstashRatelimitRedisClient | null> {
  if (!hasUpstashRestEnv()) {
    return null;
  }

  const { Redis } = await import('@upstash/redis');
  const client = Redis.fromEnv();

  const ratelimitClient: UpstashRatelimitRedisClient = {
    eval: (...args) => client.eval(...args),
    evalsha: (...args) => client.evalsha(...args),
    get: <T = unknown>(key: string) => client.get<T>(key),
    set: (key, value, options) => client.set(key, value, options),
  };

  return ratelimitClient;
}
