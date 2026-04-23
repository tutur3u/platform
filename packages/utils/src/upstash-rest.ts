import { Redis } from '@upstash/redis';

export function hasUpstashRestEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function getUpstashRestRedisClient(): Redis {
  if (!hasUpstashRestEnv())
    throw new Error('Missing Upstash Redis environment variables.');

  const client = Redis.fromEnv();

  return client;
}
