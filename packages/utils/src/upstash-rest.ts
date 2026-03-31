import { Redis } from '@upstash/redis';

export function hasUpstashRestEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export async function getUpstashRestRedisClient(): Promise<Redis | null> {
  if (!hasUpstashRestEnv()) return null;

  const client = Redis.fromEnv();

  return client;
}
