import type { UpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';

export const MASTERMIND_PUSH_REPLAY_SECONDS = 24 * 60 * 60;

const RELEASE_CLAIM = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

const COMPLETE_CLAIM = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`;

export function releaseMastermindPushClaim(
  redis: UpstashRestRedisClient,
  key: string,
  token: string
) {
  return redis.eval(RELEASE_CLAIM, [key], [token]);
}

export function completeMastermindPushClaim(
  redis: UpstashRestRedisClient,
  key: string,
  token: string
) {
  return redis.eval(
    COMPLETE_CLAIM,
    [key],
    [token, 'done', MASTERMIND_PUSH_REPLAY_SECONDS]
  );
}
