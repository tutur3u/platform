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
 *
 * @param key The lock key
 * @param ttlSeconds Lock expiration in seconds
 * @param options Lock options (failOpen)
 * @returns LockResult indicating if lock was acquired and a release function
 */
export async function acquireLock(
  key: string,
  ttlSeconds = 60,
  options: { failOpen?: boolean } = {}
): Promise<LockResult> {
  const { failOpen = false } = options;
  const redis = await getRedisClient();
  const lockKey = `lock:${key}`;

  if (!redis) {
    return { success: failOpen, release: async () => {} };
  }

  const token = crypto.randomUUID();

  try {
    const acquired = await redis.set(lockKey, token, {
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
          // Atomic compare-and-delete using Lua to ensure we only release our own lock
          await redis.eval(
            `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end
            `,
            [lockKey],
            [token]
          );
        } catch (error) {
          console.error('[Redis] Failed to release lock:', error);
        }
      },
    };
  } catch (error) {
    console.error('[Redis] Lock acquisition error:', error);
    return { success: failOpen, release: async () => {} };
  }
}

/**
 * Executes a task with a distributed lock. If the lock is already held,
 * it will poll and wait for the lock to be released before returning.
 *
 * @param key Lock key
 * @param task The task to execute if lock is acquired
 * @param options Lock options (ttl, pollInterval, maxWait, failOpen)
 * @returns Result of the task or wait
 */
export async function runWithLock<T>(
  key: string,
  task: () => Promise<T>,
  options: {
    ttlSeconds?: number;
    pollIntervalMs?: number;
    maxWaitSeconds?: number;
    failOpen?: boolean;
  } = {}
): Promise<T | { locked: true }> {
  const {
    ttlSeconds = 60,
    pollIntervalMs = 1000,
    maxWaitSeconds = 120,
    failOpen = false,
  } = options;

  const lock = await acquireLock(key, ttlSeconds, { failOpen });

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
    try {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const redis = await getRedisClient();
      if (!redis) {
        if (failOpen) return await task();
        break;
      }

      const currentLock = await redis.get(`lock:${key}`);
      if (!currentLock) {
        // Lock released, try to acquire it ourselves to proceed
        const retryLock = await acquireLock(key, ttlSeconds, { failOpen });
        if (retryLock.success) {
          try {
            return await task();
          } finally {
            await retryLock.release();
          }
        }
      }
    } catch (error) {
      console.error('[Redis] Lock polling error:', error);
      // Continue polling on transient errors
    }
  }

  return { locked: true };
}
