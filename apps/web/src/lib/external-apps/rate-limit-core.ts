import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import { hasUpstashRestEnv } from '@tuturuuu/utils/upstash-rest';
import { NextResponse } from 'next/server';
import { isNonProductionDeployment } from '@/lib/auth/external-app-refresh';
import { checkRateLimitRedis } from '@/lib/rate-limit';
import {
  EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_CODE,
  EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS,
  EXTERNAL_APP_RATE_LIMITED_CODE,
  EXTERNAL_APP_RATE_LIMITS,
  type ExternalAppRateLimitBucket,
} from './rate-limit-policy';

export type Counter = {
  bucket: ExternalAppRateLimitBucket;
  /** Refuse the request when the limiter cannot count it. */
  failClosed: boolean;
  key: string;
};

export const KEY_PREFIX = 'external-app';
const MAX_KEY_PART_LENGTH = 128;

export function keyPart(value: string) {
  return encodeURIComponent(value.trim().toLowerCase()).slice(
    0,
    MAX_KEY_PART_LENGTH
  );
}

/**
 * Without any counter store, a non-production runtime lets fail-closed
 * requests through so local and preview external-app work keeps running.
 * Production always refuses, as does any runtime with a configured store or
 * an assigned `ratelimit` family, including one switched `off`.
 */
export function counterStoreRequired() {
  return (
    isAbuseGuardFamilyAssigned('ratelimit') ||
    hasUpstashRestEnv() ||
    !isNonProductionDeployment()
  );
}

export function rateLimitedResponse(retryAfter: number, limit: number) {
  return NextResponse.json(
    {
      code: EXTERNAL_APP_RATE_LIMITED_CODE,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + retryAfter),
      },
    }
  );
}

export function limiterUnavailableResponse() {
  return NextResponse.json(
    {
      code: EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_CODE,
      error: 'Service Unavailable',
      message: 'Rate limiting is temporarily unavailable. Try again later.',
    },
    {
      status: 503,
      headers: {
        'Retry-After': String(
          EXTERNAL_APP_RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS
        ),
      },
    }
  );
}

/**
 * Counts every key once, in parallel, and returns the refusal for the request
 * or null when it may proceed.
 */
export async function consume(counters: Counter[]) {
  const results = await Promise.all(
    counters.map(async (counter) => ({
      counter,
      result: await checkRateLimitRedis(
        counter.key,
        EXTERNAL_APP_RATE_LIMITS[counter.bucket],
        { failClosed: counter.failClosed }
      ),
    }))
  );

  if (
    results.some(
      ({ counter, result }) => counter.failClosed && result.unavailable
    ) &&
    counterStoreRequired()
  ) {
    return limiterUnavailableResponse();
  }

  const now = Math.floor(Date.now() / 1000);
  const limited = results.filter(
    ({ result }) => !result.allowed && !result.unavailable
  );
  if (limited.length === 0) return null;

  const retryAfter = Math.max(
    ...limited.map(({ result }) => Math.max(1, result.reset - now))
  );
  const limit = Math.min(...limited.map(({ result }) => result.limit));
  return rateLimitedResponse(retryAfter, limit);
}
