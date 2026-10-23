/**
 * Atomic pre-work budgets for Meet guest creation/login and Nova challenges.
 * Verified logins refund only their own target reservation.
 * Missing or unavailable Upstash preserves the existing fail-open policy.
 */

import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
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
  IP_FAILED_MAX: 300,
  USER_MAX: 60,
  IP_WINDOW_MS: 15 * 60 * 1000,
} as const;

export type PasswordAttemptScope =
  | 'meet-guest'
  | 'meet-guest-create'
  | 'nova-challenge';

export type PasswordAttemptSubject = { target: string } & (
  | { scope: 'meet-guest' | 'meet-guest-create'; ip?: string | null }
  | { scope: 'nova-challenge'; userId: string }
);

type CounterClient = Pick<UpstashRatelimitRedisClient, 'eval'>;
type AttemptResult = AbuseCheckResult & { refund?: () => Promise<void> };

/** Canonical IPv4 or IPv6 /64; invalid/missing addresses share one bucket. */
export function passwordAttemptIPBucket(value?: string | null) {
  const ip = value?.trim() ?? '';
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6 || ip.includes('%')) return 'unknown';
  // URL canonicalization handles compression and IPv4-mapped addresses.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [left = '', right = ''] = canonical.split('::');
  const head = left ? left.split(':') : [];
  const tail = right ? right.split(':') : [];
  const groups = canonical.includes('::')
    ? [
        ...head,
        ...Array<string>(8 - head.length - tail.length).fill('0'),
        ...tail,
      ]
    : head;
  if (
    groups.slice(0, 5).every((group) => Number.parseInt(group, 16) === 0) &&
    Number.parseInt(groups[5] ?? '', 16) === 0xffff
  ) {
    const high = Number.parseInt(groups[6] ?? '0', 16);
    const low = Number.parseInt(groups[7] ?? '0', 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join(':')}::/64`;
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export function getPasswordAttemptKeys(subject: PasswordAttemptSubject) {
  const prefix = `pwd:failed:${subject.scope}`;
  const source =
    subject.scope === 'nova-challenge'
      ? `user:${digest(subject.userId)}`
      : `ip:${passwordAttemptIPBucket(subject.ip)}`;
  const target =
    subject.scope === 'meet-guest-create'
      ? `${subject.target}:${source}`
      : subject.target;
  return {
    target: `${prefix}:target:${digest(target)}`,
    source: `${prefix}:${source}`,
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

let nextWarningAt = 0;
function failOpen(message: string, error: unknown) {
  const now = Date.now();
  if (now < nextWarningAt) return;
  nextWarningAt = now + 60_000;
  console.warn(`[Abuse Protection] ${message}`, error);
}

// Redis runs the whole script atomically: denied attempts neither allocate new
// target keys nor extend the window. TTL and increment commit together.
export const RESERVE_PASSWORD_ATTEMPT_SCRIPT = `
local remaining = math.huge
for i, key in ipairs({KEYS[1], KEYS[2]}) do
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
for i, key in ipairs({KEYS[1], KEYS[2]}) do
  local count = redis.call('INCR', key)
  if count == 1 or redis.call('TTL', key) < 0 then
    redis.call('EXPIRE', key, tonumber(ARGV[i * 2]))
  end
end
local ttl = redis.call('PTTL', KEYS[2])
if ttl > 0 then
  redis.call('SET', KEYS[3], KEYS[2], 'PX', ttl)
end
return {1, 0, remaining}
`;

const REFUND_TARGET_SCRIPT = `
if redis.call('GET', KEYS[1]) == KEYS[2] then
  redis.call('DEL', KEYS[1])
  local count = tonumber(redis.call('GET', KEYS[2]) or '0')
  if count > 0 then
    return redis.call('DECR', KEYS[2])
  end
end
return 0
`;

export function createPasswordAttemptLimiter(
  getRedis: () => Promise<CounterClient | null> = defaultRedis
) {
  /** Reserve before KDF; call refund only after verifying the stored secret. */
  async function check(
    subject: PasswordAttemptSubject
  ): Promise<AttemptResult> {
    const redis = await getRedis().catch(() => null);
    if (!redis) {
      failOpen('Password attempt Redis unavailable:', undefined);
      return { allowed: true };
    }

    const keys = getPasswordAttemptKeys(subject);
    const receipt = `pwd:reservation:${randomUUID()}`;
    try {
      const [allowed, retryAfter, remainingAttempts] = await redis.eval<
        number[],
        [number, number, number]
      >(
        RESERVE_PASSWORD_ATTEMPT_SCRIPT,
        [keys.source, keys.target, receipt],
        [
          subject.scope === 'nova-challenge'
            ? PASSWORD_ATTEMPT_LIMITS.USER_MAX
            : PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX,
          Math.ceil(PASSWORD_ATTEMPT_LIMITS.IP_WINDOW_MS / 1000),
          PASSWORD_ATTEMPT_LIMITS.TARGET_FAILED_MAX,
          Math.ceil(PASSWORD_ATTEMPT_LIMITS.TARGET_WINDOW_MS / 1000),
        ]
      );
      return allowed === 1
        ? {
            allowed: true,
            remainingAttempts,
            refund: async () => {
              try {
                await redis.eval(
                  REFUND_TARGET_SCRIPT,
                  [receipt, keys.target],
                  []
                );
              } catch (error) {
                failOpen('Password attempt refund failed:', error);
              }
            },
          }
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
