import { verifyTurnstileToken } from '@tuturuuu/turnstile/server';
import { Ratelimit } from '@upstash/ratelimit';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { AbuseGuardClient } from './abuse-guard/client';
import { createExpiringMap } from './abuse-guard/local-cache';
import { selectAbuseGuard } from './abuse-guard/select';
import { extractIPFromRequest } from './abuse-protection/edge';
import { getCachedTrustEntries } from './abuse-protection/edge-trust';
import {
  buildProxySessionSubjectKey,
  getProxySessionSubjectKeyFromCookieHeader,
} from './api-proxy-guard';
import { type GuardRejectionReason, guardRejection } from './guard-rejection';
import {
  getUpstashRatelimitRedisClient,
  getUpstashRestRedisClient,
} from './upstash-rest';

export const OFFLINE_DOWNLOAD_HEADER = 'x-tuturuuu-offline-download';
const CLEARANCE_SECONDS = 15 * 60;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const READ_PATH =
  /^\/api\/(?:v1\/)?workspaces\/[^/]+\/(?:finance|inventory|transactions|wallets|tags|members|products|product-categories|product-units|product-warehouses|tasks|task-boards|boards|labels|task-projects|task-initiatives|habit-trackers|habits|calendar)(?:[-/]|$)/u;
const USER_READ_PATH =
  /^\/api\/v1\/(?:users\/me\/tasks|calendar|users\/calendar-settings)(?:\/|$)/u;

export function isOfflineCapableRead(
  request: Pick<NextRequest, 'method' | 'url'>
) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const pathname = new URL(request.url).pathname.replace(
    /^\/api\/v1\/mobile-calendar(?=\/api\/)/u,
    ''
  );
  return (
    READ_PATH.test(pathname) ||
    USER_READ_PATH.test(pathname) ||
    /^\/api\/v1\/exchange-rates\/?$/u.test(pathname)
  );
}

function unavailable(
  request: NextRequest,
  reason: GuardRejectionReason = 'offline-download-unavailable'
) {
  return guardRejection(
    request,
    NextResponse.json(
      {
        message:
          'Download protection is temporarily unavailable. Try again later.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
      }
    ),
    reason
  );
}

function challenge(request: NextRequest) {
  return guardRejection(
    request,
    NextResponse.json(
      {
        code: 'ABUSE_CHALLENGE_REQUIRED',
        message: 'Additional verification is required before retrying.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
          'X-Abuse-Challenge': 'turnstile',
        },
      }
    ),
    'offline-download-challenge-required'
  );
}

type OfflineSubject = {
  key: string;
  minute: number;
  hour: number;
  /** Daily reads; enforced on the guard store only. */
  day?: number;
};

/**
 * Daily marked reads per IP and per session on the guard store. With up to
 * three operations per read this keeps one source at a quarter of the default
 * offline share (600,000), so no single source can exhaust it.
 */
export const SOURCE_DAILY_READS = 50_000;
const DAY_MS = 24 * 60 * 60_000;

/** Storage operations of the offline guard; every failure throws. */
type OfflineGuardStore = {
  /** Charges each subject in order; returns the first denial, if any. */
  limit(subjects: OfflineSubject[]): Promise<{ reset: number } | null>;
  hasClearance(key: string): Promise<boolean>;
  grantClearance(key: string): Promise<void>;
};

/** Subjects denied by the store, remembered per instance until their reset. */
const deniedSubjects = createExpiringMap<number>();

function durableObjectStore(client: AbuseGuardClient): OfflineGuardStore {
  return {
    async limit(subjects) {
      if (subjects.length === 0) return null;
      // A subject still inside a known denial costs no store operation.
      for (const subject of subjects) {
        const reset = deniedSubjects.get(subject.key);
        if (reset !== undefined) return { reset };
      }
      // One RPC: each subject's minute and hour windows are all-or-nothing,
      // and later subjects are not charged after a denial.
      const outcome = await client.hitWindows(
        subjects.map((subject) => ({
          partition: subject.key,
          windows: [
            {
              key: '1m',
              limit: subject.minute,
              windowMs: MINUTE_MS,
              algo: 'sliding' as const,
            },
            {
              key: '1h',
              limit: subject.hour,
              windowMs: HOUR_MS,
              algo: 'sliding' as const,
            },
            ...(subject.day
              ? [
                  {
                    key: '1d',
                    limit: subject.day,
                    windowMs: DAY_MS,
                    algo: 'fixed' as const,
                  },
                ]
              : []),
          ],
        }))
      );
      if (outcome.ok) return null;
      const denied = subjects[outcome.subjectIndex];
      if (denied)
        deniedSubjects.set(denied.key, outcome.resetAt, outcome.resetAt);
      return { reset: outcome.resetAt };
    },
    async hasClearance(key) {
      return Boolean(await client.get(key));
    },
    async grantClearance(key) {
      await client.set(key, 'passed', { ttlMs: CLEARANCE_SECONDS * 1000 });
    },
  };
}

async function upstashStore(): Promise<OfflineGuardStore | null> {
  const redis = await getUpstashRestRedisClient();
  const limiterRedis = await getUpstashRatelimitRedisClient();
  if (!redis || !limiterRedis) return null;
  return {
    async limit(subjects) {
      for (const subject of subjects) {
        for (const [window, limit] of [
          ['1 m', subject.minute],
          ['1 h', subject.hour],
        ] as const) {
          const limiter = new Ratelimit({
            redis: limiterRedis,
            limiter: Ratelimit.slidingWindow(limit, window),
            prefix: `offline:read:${window}`,
          });
          const result = await limiter.limit(subject.key);
          if (!result.success) return { reset: result.reset };
        }
      }
      return null;
    },
    async hasClearance(key) {
      return Boolean(await redis.get(key));
    },
    async grantClearance(key) {
      await redis.set(key, 'passed', { ex: CLEARANCE_SECONDS });
    },
  };
}

/** Additional protection is scoped to explicitly marked offline bulk downloads.
 * Ordinary enterprise reads retain their existing API/auth protections.
 * Clearance never satisfies authentication, authorization, IP blocks, required
 * MFA, or either rate-limit budget. Runtime failures remain fail-closed. */
export async function guardOfflineDownloadRequest(
  request: NextRequest,
  options: {
    /** User id the proxy verified for this request's bearer, if any. */
    verifiedActor?: string | null;
  } = {}
) {
  if (!isOfflineCapableRead(request) || process.env.NODE_ENV !== 'production')
    return null;
  const bulk = request.headers.get(OFFLINE_DOWNLOAD_HEADER) === '1';
  if (!bulk) return null;
  if (process.env.OFFLINE_DOWNLOAD_PROTECTION_ENABLED !== 'true') {
    // Keep baseline API/auth protections while this additional protection is
    // unprovisioned. Offline prefetch is unavailable until explicitly enabled.
    return unavailable(request, 'offline-download-inactive');
  }
  try {
    const selection = selectAbuseGuard('offline');
    if (selection.kind === 'off') return unavailable(request);
    const store =
      selection.kind === 'durable-object'
        ? durableObjectStore(selection.client)
        : await upstashStore();
    if (!store) return unavailable(request);
    const bearer = request.headers
      .get('authorization')
      ?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    const sessionKey = bearer
      ? await buildProxySessionSubjectKey('bearer', bearer)
      : await getProxySessionSubjectKeyFromCookieHeader(
          request.headers.get('cookie')
        );
    const ip = extractIPFromRequest(request.headers);
    // On the guard store, session windows and clearance are spent only for a
    // verified actor: rotating opaque bearers cost a single IP operation and
    // never reach the session or clearance partitions.
    const admittedSessionKey =
      selection.kind === 'durable-object' && !options.verifiedActor
        ? null
        : sessionKey;
    // IP remains bounded even when a caller rotates unverified bearer values.
    // Internal authenticated gateways may lack a client IP. Never combine
    // their unrelated sessions into a shared unknown-IP bucket. Public ingress
    // still supplies a real IP, retaining the rotating-token budget.
    if (ip === 'unknown' && !admittedSessionKey) return unavailable(request);
    // Daily windows bound one source's share below the family allowance.
    const subjects: OfflineSubject[] = [
      ...(ip !== 'unknown'
        ? [
            {
              key: `ip:${ip}`,
              minute: 1200,
              hour: 30000,
              day: SOURCE_DAILY_READS,
            },
          ]
        : []),
      ...(admittedSessionKey
        ? [
            {
              key: admittedSessionKey,
              minute: 600,
              hour: 12000,
              day: SOURCE_DAILY_READS,
            },
          ]
        : []),
    ];
    const denial = await store.limit(subjects);
    if (denial) {
      return guardRejection(
        request,
        NextResponse.json(
          {
            message: 'Read limit reached. Try again after the indicated delay.',
          },
          {
            status: 429,
            headers: {
              'Cache-Control': 'no-store',
              'Retry-After': `${Math.max(1, Math.ceil((denial.reset - Date.now()) / 1000))}`,
              'X-RateLimit-Policy': 'offline-capable-read',
            },
          }
        ),
        'offline-download-rate-limited'
      );
    }
    if (!admittedSessionKey)
      return guardRejection(
        request,
        NextResponse.json(
          { message: 'Authentication required' },
          { status: 401 }
        ),
        'offline-download-authentication-required'
      );
    const trust = (await getCachedTrustEntries([admittedSessionKey])).get(
      admittedSessionKey
    );
    // Reuse established account trust. This check does not write trust markers.
    if (trust?.verified && (trust.m > 1 || trust.mode === 'unlimited'))
      return null;
    const clearanceKey = `offline:clearance:${admittedSessionKey}`;
    if (await store.hasClearance(clearanceKey)) return null;
    const token = request.headers.get('x-tuturuuu-turnstile-token');
    if (!token) return challenge(request);
    try {
      await verifyTurnstileToken(request, token, {
        remoteIp: ip === 'unknown' ? undefined : ip,
      });
    } catch {
      return challenge(request);
    }
    await store.grantClearance(clearanceKey);
    return null;
  } catch {
    // A distributed guard must not silently fall back to per-process limits.
    return unavailable(request);
  }
}
