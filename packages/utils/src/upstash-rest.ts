import type { Redis } from '@upstash/redis';

export type UpstashRestRedisClient = Pick<
  Redis,
  'del' | 'expire' | 'get' | 'incr' | 'set' | 'ttl'
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

export async function getUpstashRestRedisClient(): Promise<UpstashRestRedisClient | null> {
  if (!hasUpstashRestEnv()) {
    return null;
  }

  const { Redis } = await import('@upstash/redis');
  const client = Redis.fromEnv();

  const restClient: UpstashRestRedisClient = {
    del: (...keys) => client.del(...keys),
    expire: (key, seconds) => client.expire(key, seconds),
    get: <T = unknown>(key: string) => client.get<T>(key),
    incr: (key) => client.incr(key),
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
