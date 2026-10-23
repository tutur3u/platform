/**
 * Per-account MFA verification limits.
 *
 * The IP-keyed MFA limit in ./index alone lets an attacker who rotates
 * addresses keep guessing codes for one account. These counters are keyed by
 * the authenticated user and by the user's factor, so the budget follows the
 * account regardless of source address. Like the rest of abuse protection they
 * fail open when Redis is unavailable; the database MFA verification hook
 * enforces the same limit at the auth server.
 */

import {
  getUpstashRestRedisClient,
  hasUpstashRestEnv,
  type UpstashRestRedisClient,
} from '../upstash-rest';
import type { AbuseCheckResult } from './types';

export const MFA_SUBJECT_LIMITS = {
  /** Failed codes allowed for one factor of one user per window. */
  FACTOR_FAILED_MAX: 5,
  FACTOR_WINDOW_MS: 15 * 60 * 1000,
  /** Failed codes allowed across all factors of one user per window. */
  USER_FAILED_MAX: 10,
  USER_WINDOW_MS: 60 * 60 * 1000,
} as const;

export interface MFAVerifySubject {
  userId: string;
  factorId: string;
}

type CounterClient = Pick<
  UpstashRestRedisClient,
  'del' | 'expire' | 'get' | 'incr' | 'ttl'
>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function keyPart(value: string) {
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed.toLowerCase() : 'invalid';
}

export function getMFASubjectKeys(subject: MFAVerifySubject) {
  const user = keyPart(subject.userId);
  return {
    factor: `mfa:verify:failed:user:${user}:factor:${keyPart(subject.factorId)}`,
    user: `mfa:verify:failed:user:${user}`,
  };
}

async function defaultRedis(): Promise<CounterClient | null> {
  if (!hasUpstashRestEnv()) return null;
  return getUpstashRestRedisClient();
}

function failOpen(message: string, error: unknown) {
  console.warn(`[Abuse Protection] ${message}`, error);
}

export function createMFASubjectLimiter(
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

  async function check(subject: MFAVerifySubject): Promise<AbuseCheckResult> {
    const redis = await getRedis().catch(() => null);
    if (!redis) return { allowed: true };

    const keys = getMFASubjectKeys(subject);
    try {
      const [factorCount, userCount] = await Promise.all([
        redis.get<number>(keys.factor),
        redis.get<number>(keys.user),
      ]);
      const factorFailures = Number(factorCount) || 0;
      const userFailures = Number(userCount) || 0;

      if (userFailures >= MFA_SUBJECT_LIMITS.USER_FAILED_MAX) {
        return {
          allowed: false,
          reason: 'Too many failed MFA verification attempts',
          retryAfter: await remainingSeconds(
            redis,
            keys.user,
            MFA_SUBJECT_LIMITS.USER_WINDOW_MS
          ),
          remainingAttempts: 0,
        };
      }

      if (factorFailures >= MFA_SUBJECT_LIMITS.FACTOR_FAILED_MAX) {
        return {
          allowed: false,
          reason: 'Too many failed MFA verification attempts',
          retryAfter: await remainingSeconds(
            redis,
            keys.factor,
            MFA_SUBJECT_LIMITS.FACTOR_WINDOW_MS
          ),
          remainingAttempts: 0,
        };
      }

      return {
        allowed: true,
        remainingAttempts: Math.min(
          MFA_SUBJECT_LIMITS.FACTOR_FAILED_MAX - factorFailures,
          MFA_SUBJECT_LIMITS.USER_FAILED_MAX - userFailures
        ),
      };
    } catch (error) {
      failOpen('MFA subject limit read failed:', error);
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

  async function recordFailure(subject: MFAVerifySubject): Promise<void> {
    const redis = await getRedis().catch(() => null);
    if (!redis) return;

    const keys = getMFASubjectKeys(subject);
    try {
      await Promise.all([
        increment(redis, keys.factor, MFA_SUBJECT_LIMITS.FACTOR_WINDOW_MS),
        increment(redis, keys.user, MFA_SUBJECT_LIMITS.USER_WINDOW_MS),
      ]);
    } catch (error) {
      failOpen('MFA subject limit write failed:', error);
    }
  }

  /** A successful code proves possession of the factor; reset its budget. */
  async function clear(subject: MFAVerifySubject): Promise<void> {
    const redis = await getRedis().catch(() => null);
    if (!redis) return;

    const keys = getMFASubjectKeys(subject);
    try {
      await redis.del(keys.factor, keys.user);
    } catch (error) {
      failOpen('MFA subject limit reset failed:', error);
    }
  }

  return { check, clear, recordFailure };
}

const defaultLimiter = createMFASubjectLimiter();

export const checkMFAVerifySubjectLimit = defaultLimiter.check;
export const recordMFAVerifySubjectFailure = defaultLimiter.recordFailure;
export const clearMFAVerifySubjectFailures = defaultLimiter.clear;
