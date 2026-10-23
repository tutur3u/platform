/**
 * Failure budgets for shared-secret password checks (Meet guest login, Nova
 * challenge passwords).
 *
 * Each check is limited per target (one guest identity or one challenge for
 * one user) and per client IP, so guessing is bounded whether the attacker
 * focuses on one target or sprays many from one address. Counters live in
 * Upstash Redis; like the rest of abuse protection they fail open when Redis
 * is not configured or unavailable, leaving the KDF cost as the only bound.
 */

import { createHash } from 'node:crypto';
import {
  getUpstashRestRedisClient,
  hasUpstashRestEnv,
  type UpstashRestRedisClient,
} from '../upstash-rest';
import type { AbuseCheckResult } from './types';

export const PASSWORD_ATTEMPT_LIMITS = {
  /** Failed passwords allowed for one target per window. */
  TARGET_FAILED_MAX: 10,
  TARGET_WINDOW_MS: 15 * 60 * 1000,
  /** Failed passwords allowed from one IP across targets per window. */
  IP_FAILED_MAX: 30,
  IP_WINDOW_MS: 15 * 60 * 1000,
} as const;

export type PasswordAttemptScope = 'meet-guest' | 'nova-challenge';

export interface PasswordAttemptSubject {
  scope: PasswordAttemptScope;
  /**
   * Stable identity of the guessed secret, e.g. plan id + normalized guest
   * name. Hashed before use so raw names never reach Redis keys.
   */
  target: string;
  /** Client IP from the trusted IP helper; `unknown`/empty skips the IP budget. */
  ip?: string | null;
}

type CounterClient = Pick<
  UpstashRestRedisClient,
  'del' | 'expire' | 'get' | 'incr' | 'ttl'
>;

const IP_PATTERN = /^[0-9A-Fa-f:.]{2,45}$/u;

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export function getPasswordAttemptKeys(subject: PasswordAttemptSubject) {
  const prefix = `pwd:failed:${subject.scope}`;
  const ip = subject.ip?.trim();
  return {
    target: `${prefix}:target:${digest(subject.target)}`,
    ip: ip && IP_PATTERN.test(ip) ? `${prefix}:ip:${ip.toLowerCase()}` : null,
  };
}

/** Normalizes a guest display name for budget keying only. */
export function normalizePasswordAttemptName(name: string) {
  return name.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
}

async function defaultRedis(): Promise<CounterClient | null> {
  if (!hasUpstashRestEnv()) return null;
  return getUpstashRestRedisClient();
}

function failOpen(message: string, error: unknown) {
  console.warn(`[Abuse Protection] ${message}`, error);
}

export function createPasswordAttemptLimiter(
  getRedis: () => Promise<CounterClient | null> = defaultRedis
) {
  async function remainingSeconds(
    redis: CounterClient,
    key: string,
    windowMs: number
  ) {
    const ttl = await redis.ttl(key);
    return ttl > 0 ? ttl : Math.ceil(windowMs / 1000);
  }

  async function check(
    subject: PasswordAttemptSubject
  ): Promise<AbuseCheckResult> {
    const redis = await getRedis().catch(() => null);
    if (!redis) return { allowed: true };

    const keys = getPasswordAttemptKeys(subject);
    try {
      const [targetCount, ipCount] = await Promise.all([
        redis.get<number>(keys.target),
        keys.ip ? redis.get<number>(keys.ip) : Promise.resolve(0),
      ]);
      const targetFailures = Number(targetCount) || 0;
      const ipFailures = Number(ipCount) || 0;

      if (keys.ip && ipFailures >= PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX) {
        return {
          allowed: false,
          reason: 'Too many failed password attempts',
          retryAfter: await remainingSeconds(
            redis,
            keys.ip,
            PASSWORD_ATTEMPT_LIMITS.IP_WINDOW_MS
          ),
          remainingAttempts: 0,
        };
      }

      if (targetFailures >= PASSWORD_ATTEMPT_LIMITS.TARGET_FAILED_MAX) {
        return {
          allowed: false,
          reason: 'Too many failed password attempts',
          retryAfter: await remainingSeconds(
            redis,
            keys.target,
            PASSWORD_ATTEMPT_LIMITS.TARGET_WINDOW_MS
          ),
          remainingAttempts: 0,
        };
      }

      return {
        allowed: true,
        remainingAttempts: Math.min(
          PASSWORD_ATTEMPT_LIMITS.TARGET_FAILED_MAX - targetFailures,
          keys.ip
            ? PASSWORD_ATTEMPT_LIMITS.IP_FAILED_MAX - ipFailures
            : Number.POSITIVE_INFINITY
        ),
      };
    } catch (error) {
      failOpen('Password attempt limit read failed:', error);
      return { allowed: true };
    }
  }

  async function increment(
    redis: CounterClient,
    key: string,
    windowMs: number
  ) {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, Math.ceil(windowMs / 1000));
    return count;
  }

  async function recordFailure(subject: PasswordAttemptSubject) {
    const redis = await getRedis().catch(() => null);
    if (!redis) return;

    const keys = getPasswordAttemptKeys(subject);
    try {
      await Promise.all([
        increment(redis, keys.target, PASSWORD_ATTEMPT_LIMITS.TARGET_WINDOW_MS),
        keys.ip
          ? increment(redis, keys.ip, PASSWORD_ATTEMPT_LIMITS.IP_WINDOW_MS)
          : null,
      ]);
    } catch (error) {
      failOpen('Password attempt limit write failed:', error);
    }
  }

  /**
   * A correct password resets the target budget. The IP budget is kept so a
   * client cannot launder failures across targets with one known password.
   */
  async function clear(subject: PasswordAttemptSubject) {
    const redis = await getRedis().catch(() => null);
    if (!redis) return;

    try {
      await redis.del(getPasswordAttemptKeys(subject).target);
    } catch (error) {
      failOpen('Password attempt limit reset failed:', error);
    }
  }

  return { check, clear, recordFailure };
}

const defaultLimiter = createPasswordAttemptLimiter();

export const checkPasswordAttemptLimit = defaultLimiter.check;
export const recordPasswordAttemptFailure = defaultLimiter.recordFailure;
export const clearPasswordAttemptFailures = defaultLimiter.clear;
