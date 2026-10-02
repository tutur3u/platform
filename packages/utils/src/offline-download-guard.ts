import { verifyTurnstileToken } from '@tuturuuu/turnstile/server';
import { Ratelimit } from '@upstash/ratelimit';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { extractIPFromRequest } from './abuse-protection/edge';
import { getCachedTrustEntries } from './abuse-protection/edge-trust';
import {
  buildProxySessionSubjectKey,
  getProxySessionSubjectKeyFromCookieHeader,
} from './api-proxy-guard';
import {
  getUpstashRatelimitRedisClient,
  getUpstashRestRedisClient,
} from './upstash-rest';

export const OFFLINE_DOWNLOAD_HEADER = 'x-tuturuuu-offline-download';
const CLEARANCE_SECONDS = 15 * 60;
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
  return READ_PATH.test(pathname) || USER_READ_PATH.test(pathname);
}

function unavailable() {
  return NextResponse.json(
    {
      message:
        'Download protection is temporarily unavailable. Try again later.',
    },
    {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
    }
  );
}

function challenge() {
  return NextResponse.json(
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
  );
}

/** Independent of the client marker: ordinary reads cannot evade the download
 * budgets by omitting it. Clearance satisfies CAPTCHA only, never authentication,
 * authorization, IP blocks, required MFA, or either rate-limit budget. */
export async function guardOfflineDownloadRequest(request: NextRequest) {
  if (!isOfflineCapableRead(request) || process.env.NODE_ENV !== 'production')
    return null;
  const bulk = request.headers.get(OFFLINE_DOWNLOAD_HEADER) === '1';
  try {
    const redis = await getUpstashRestRedisClient();
    const limiterRedis = await getUpstashRatelimitRedisClient();
    if (!redis || !limiterRedis) return unavailable();
    const bearer = request.headers
      .get('authorization')
      ?.match(/^Bearer ([^\s]+)$/i)?.[1];
    const sessionKey = bearer
      ? await buildProxySessionSubjectKey('bearer', bearer)
      : await getProxySessionSubjectKeyFromCookieHeader(
          request.headers.get('cookie')
        );
    const ip = extractIPFromRequest(request.headers);
    // IP remains bounded even when a caller rotates unverified bearer values.
    const subjects = [
      { key: `ip:${ip}`, minute: 1200, hour: 30000 },
      ...(sessionKey ? [{ key: sessionKey, minute: 600, hour: 12000 }] : []),
    ];
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
        if (!result.success) {
          return NextResponse.json(
            {
              message:
                'Read limit reached. Try again after the indicated delay.',
            },
            {
              status: 429,
              headers: {
                'Cache-Control': 'no-store',
                'Retry-After': `${Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))}`,
                'X-RateLimit-Policy': 'offline-capable-read',
              },
            }
          );
        }
      }
    }
    if (!bulk) return null;
    if (!sessionKey)
      return NextResponse.json(
        { message: 'Authentication required' },
        { status: 401 }
      );
    const trust = (await getCachedTrustEntries([sessionKey])).get(sessionKey);
    // Reuse established account trust. This check does not write trust markers.
    if (trust?.verified && (trust.m > 1 || trust.mode === 'unlimited'))
      return null;
    const clearanceKey = `offline:clearance:${sessionKey}`;
    if (await redis.get(clearanceKey)) return null;
    const token = request.headers.get('x-tuturuuu-turnstile-token');
    if (!token) return challenge();
    try {
      await verifyTurnstileToken(request, token, {
        remoteIp: ip === 'unknown' ? undefined : ip,
      });
    } catch {
      return challenge();
    }
    await redis.set(clearanceKey, 'passed', { ex: CLEARANCE_SECONDS });
    return null;
  } catch {
    // A distributed guard must not silently fall back to per-process limits.
    return unavailable();
  }
}
