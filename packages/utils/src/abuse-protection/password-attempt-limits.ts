/**
 * Atomic pre-work budgets for Meet guest creation/login and Nova challenges.
 * All admitted attempts, including successes, consume capacity until expiry.
 * Missing or unavailable Upstash preserves the existing fail-open policy.
 */

import { createHash } from 'node:crypto';
import {
  getUpstashRatelimitRedisClient,
  hasUpstashRestEnv,
  type UpstashRatelimitRedisClient,
} from '../upstash-rest';
import type { AbuseCheckResult } from './types';

export const PASSWORD_ATTEMPT_LIMITS = {
  /** Password attempts allowed for one target per window. */
  TARGET_FAILED_MAX: 10,
  TARGET_WINDOW_MS: 15 * 60 * 1000,
  /** Password attempts allowed from one IP across targets per window. */
  IP_FAILED_MAX: 30,
  IP_WINDOW_MS: 15 * 60 * 1000,
} as const;

export type PasswordAttemptScope =
  | 'meet-guest'
  | 'meet-guest-create'
  | 'nova-challenge';

export interface PasswordAttemptSubject {
  scope: PasswordAttemptScope;
  /**
   * Stable identity of the guessed secret, e.g. plan id + normalized guest
   * name. Hashed before use so raw names never reach Redis keys.
   */
  target: string;
  /** Client IP from the trusted helper; missing/invalid values share a bucket. */
  ip?: string | null;
}

type CounterClient = Pick<UpstashRatelimitRedisClient, 'eval'>;

const IP_PATTERN = /^[0-9A-Fa-f:.]{2,45}$/u;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export function getPasswordAttemptKeys(subject: PasswordAttemptSubject) {
  const prefix = `pwd:failed:${subject.scope}`;
  const ip = subject.ip?.trim();
  return {
    target: `${prefix}:target:${digest(subject.target)}`,
    ip: `${prefix}:ip:${ip && IP_PATTERN.test(ip) ? ip.toLowerCase() : 'unknown'}`,
  };
}

/** Normalizes a guest display name for budget keying only. */
export function normalizePasswordAttemptName(name: string) {
  return name.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
}

async function defaultRedis(): Promise<CounterClient | null> {
  if (!hasUpstashRestEnv()) return null;
  return getUpstashRatelimitRedisClient();
}

function failOpen(message: string, error: unknown) {
  console.warn(`[Abuse Protection] ${message}`, error);
}

// Redis runs the whole script atomically: denied attempts neither allocate new
// target keys nor extend the window. TTL and increment commit together.
export const RESERVE_PASSWORD_ATTEMPT_SCRIPT = `
local remaining = math.huge
for i, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[(i - 1) * 2 + 1])
  local count = tonumber(redis.call('GET', key) or '0')
  if count >= limit then
    local ttl = redis.call('TTL', key)
    if ttl < 0 then
      ttl = tonumber(ARGV[i * 2])
      redis.call('EXPIRE', key, ttl)
    end
    return {0, ttl, 0}
  end
  remaining = math.min(remaining, limit - count - 1)
end
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 or redis.call('TTL', key) < 0 then
    redis.call('EXPIRE', key, tonumber(ARGV[i * 2]))
  end
end
return {1, 0, remaining}
`;

export function createPasswordAttemptLimiter(
  getRedis: () => Promise<CounterClient | null> = defaultRedis
) {
  /** Reserves capacity before KDF work; success does not reset concurrent work. */
  async function check(
    subject: PasswordAttemptSubject
  ): Promise<AbuseCheckResult> {
    const redis = await getRedis().catch(() => null);
    if (!redis) return { allowed: true };

    const keys = getPasswordAttemptKeys(subject);
    try {
      const [allowed, retryAfter, remainingAttempts] = await redis.eval<
        number[],
        [number, number, number]
      >(
        RESERVE_PASSWORD_ATTEMPT_SCRIPT,
        [keys.ip, keys.target],
        [
          PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX,
          Math.ceil(PASSWORD_ATTEMPT_LIMITS.IP_WINDOW_MS / 1000),
          PASSWORD_ATTEMPT_LIMITS.TARGET_FAILED_MAX,
          Math.ceil(PASSWORD_ATTEMPT_LIMITS.TARGET_WINDOW_MS / 1000),
        ]
      );
      return allowed === 1
        ? { allowed: true, remainingAttempts }
        : {
            allowed: false,
            reason: 'Too many failed password attempts',
            retryAfter,
            remainingAttempts: 0,
          };
    } catch (error) {
      failOpen('Password attempt reservation failed:', error);
      return { allowed: true };
    }
  }

  return { check };
}

const defaultLimiter = createPasswordAttemptLimiter();

export const checkPasswordAttemptLimit = defaultLimiter.check;
