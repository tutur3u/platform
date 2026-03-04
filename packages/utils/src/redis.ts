import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;
let redisInitialized = false;

/**
 * Initialize Redis client from Upstash environment variables.
 * Returns null if Redis is not configured or unavailable.
 */
export async function getRedisClient(): Promise<Redis | null> {
  if (redisInitialized) return redisClient;

  try {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!redisUrl || !redisToken) {
      redisInitialized = true;
      return null;
    }

    redisClient = Redis.fromEnv();
    redisInitialized = true;
    return redisClient;
  } catch (error) {
    console.warn('[Redis] Client initialization failed:', error);
    redisInitialized = true;
    return null;
  }
}

/**
 * Acquisition result for a distributed lock.
 */
export type LockResult = {
  success: boolean;
  release: () => Promise<void>;
};

/**
 * Attempt to acquire a distributed lock using Redis SETNX.
 * Falls back to true (no-op) if Redis is not configured.
 *
 * @param key The lock key
 * @param ttlSeconds Lock expiration in seconds
 * @returns LockResult indicating if lock was acquired and a release function
 */
export async function acquireLock(
  key: string,
  ttlSeconds = 60
): Promise<LockResult> {
  const redis = await getRedisClient();
  const lockKey = `lock:${key}`;

  if (!redis) {
    return { success: true, release: async () => {} };
  }

  try {
    const acquired = await redis.set(lockKey, 'locked', {
      nx: true,
      ex: ttlSeconds,
    });

    if (!acquired) {
      return { success: false, release: async () => {} };
    }

    return {
      success: true,
      release: async () => {
        try {
          await redis.del(lockKey);
        } catch (error) {
          console.error('[Redis] Failed to release lock:', error);
        }
      },
    };
  } catch (error) {
    console.error('[Redis] Lock acquisition error:', error);
    // If Redis fails, we fallback to allowing the operation
    return { success: true, release: async () => {} };
  }
}

/**
 * Executes a task with a distributed lock. If the lock is already held,
 * it will poll and wait for the lock to be released before returning.
 *
 * @param key Lock key
 * @param task The task to execute if lock is acquired
 * @param options Lock options (ttl, pollInterval, maxWait)
 * @returns Result of the task or wait
 */
export async function runWithLock<T>(
  key: string,
  task: () => Promise<T>,
  options: {
    ttlSeconds?: number;
    pollIntervalMs?: number;
    maxWaitSeconds?: number;
  } = {}
): Promise<T | { locked: true }> {
  const {
    ttlSeconds = 60,
    pollIntervalMs = 1000,
    maxWaitSeconds = 120,
  } = options;

  const lock = await acquireLock(key, ttlSeconds);

  if (lock.success) {
    try {
      return await task();
    } finally {
      await lock.release();
    }
  }

  // Poll for lock release if not acquired
  const start = Date.now();
  const maxWait = maxWaitSeconds * 1000;

  while (Date.now() - start < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const redis = await getRedisClient();
    if (!redis) break;

    const currentLock = await redis.get(`lock:${key}`);
    if (!currentLock) {
      // Lock released, try to acquire it ourselves to proceed
      const retryLock = await acquireLock(key, ttlSeconds);
      if (retryLock.success) {
        try {
          return await task();
        } finally {
          await retryLock.release();
        }
      }
    }
  }

  return { locked: true };
}
