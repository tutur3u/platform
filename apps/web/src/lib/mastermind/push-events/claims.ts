import type { UpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';

export const MASTERMIND_PUSH_REPLAY_SECONDS = 24 * 60 * 60;

export const RELEASE_CLAIM_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`;

export const COMPLETE_CLAIM_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`;

export function releaseMastermindPushClaim(
  redis: Pick<UpstashRestRedisClient, 'eval'>,
  key: string,
  token: string
) {
  return redis.eval(RELEASE_CLAIM_SCRIPT, [key], [token]);
}

export function completeMastermindPushClaim(
  redis: Pick<UpstashRestRedisClient, 'eval'>,
  key: string,
  token: string,
  ttlSeconds = MASTERMIND_PUSH_REPLAY_SECONDS
) {
  return redis.eval(COMPLETE_CLAIM_SCRIPT, [key], [token, 'done', ttlSeconds]);
}
