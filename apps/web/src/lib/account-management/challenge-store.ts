import { getUpstashRatelimitRedisClient } from '@tuturuuu/utils/upstash-rest';
import { AccountManagementError, type ChallengeStore } from './policy';

/** Fail closed when shared Redis is unavailable; never fall back to process memory. */
export async function createChallengeStore(): Promise<ChallengeStore> {
  const redis = await getUpstashRatelimitRedisClient();
  if (!redis) throw new AccountManagementError('challenge_unavailable', 503);
  return {
    async putIfAbsent(key, value, ttlSeconds) {
      return (
        (await redis.set(key, value, { nx: true, ex: ttlSeconds })) === 'OK'
      );
    },
    async getdel(key) {
      return redis.eval("return redis.call('GETDEL', KEYS[1])", [key], []);
    },
  };
}
