import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
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

type Counter = {
  bucket: ExternalAppRateLimitBucket;
  /** Refuse the request when the limiter cannot count it. */
  failClosed: boolean;
  key: string;
};

const KEY_PREFIX = 'external-app';
const MAX_KEY_PART_LENGTH = 128;
const READ_METHODS = new Set(['GET', 'HEAD']);
/** Non-GET routes that only read: a signed read URL changes nothing. */
const READ_ROUTES = new Set(['POST drive/read-url']);

function keyPart(value: string) {
  return encodeURIComponent(value.trim().toLowerCase()).slice(
    0,
    MAX_KEY_PART_LENGTH
  );
}

/**
 * The workspace part of a key. `personal` names a different workspace for
 * each user, so it is counted per user instead of as one shared workspace.
 */
function workspaceKeyPart(wsId: string, userId: string) {
  const resolved = resolveWorkspaceId(wsId);
  return resolved.trim().toLowerCase() === PERSONAL_WORKSPACE_SLUG
    ? `personal:${keyPart(userId)}`
    : keyPart(resolved);
}

/**
 * Without any counter store, a non-production runtime lets fail-closed
 * requests through so local and preview external-app work keeps running.
 * Production always refuses, as does any runtime with a configured store.
 */
function counterStoreRequired() {
  return (
    isAbuseGuardFamilyAssigned('ratelimit') ||
    hasUpstashRestEnv() ||
    !isNonProductionDeployment()
  );
}

function rateLimitedResponse(retryAfter: number, limit: number) {
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

function limiterUnavailableResponse() {
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
async function consume(counters: Counter[]) {
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

/** The counters one external-app workspace request consumes. */
export function externalAppWorkspaceCounters({
  appId,
  method,
  pattern,
  userId,
  wsId,
}: {
  appId: string;
  method: string;
  pattern: readonly string[];
  userId: string;
  wsId: string;
}): Counter[] {
  const route = pattern.join('/');
  const app = keyPart(appId);
  const workspace = workspaceKeyPart(wsId, userId);
  const workspaceCounter = (bucket: ExternalAppRateLimitBucket) => ({
    bucket,
    failClosed: bucket !== 'read',
    key: `${KEY_PREFIX}:${bucket}:app:${app}:ws:${workspace}`,
  });

  if (READ_METHODS.has(method) || READ_ROUTES.has(`${method} ${route}`)) {
    // Reads fail open, as `checkRateLimit` does: a read changes nothing and
    // sends nothing, so a limiter outage should not take the app's reads down.
    return [workspaceCounter('read')];
  }

  const counters: Counter[] = [workspaceCounter('write')];
  if (route === 'drive/upload-url') {
    counters.push({
      bucket: 'uploadUrl',
      failClosed: true,
      key: `${KEY_PREFIX}:uploadUrl:app:${app}:user:${keyPart(userId)}`,
    });
  }
  if (route === 'members/invitations') {
    counters.push(workspaceCounter('invitation'));
  }
  return counters;
}

/**
 * Limits an external-app workspace request by its verified bearer. A request
 * without a valid app bearer is left to the handler, which refuses it before
 * any database work.
 */
export async function limitExternalAppWorkspaceRequest(
  request: Request,
  {
    method,
    pattern,
    wsId,
  }: { method: string; pattern: readonly string[]; wsId: string }
) {
  if (method === 'OPTIONS') return undefined;
  const token = getBearerAppCoordinationToken(request);
  if (!token) return undefined;
  const verification = verifyAppCoordinationToken(token);
  if (!verification.ok) return undefined;

  const refusal = await consume(
    externalAppWorkspaceCounters({
      appId: verification.claims.target_app,
      method,
      pattern,
      userId: verification.claims.sub,
      wsId,
    })
  );
  return refusal ?? undefined;
}

/** Limits a cross-app token exchange per app and trusted client IP. */
export function limitExternalAppTokenExchange({
  appId,
  ip,
}: {
  appId: string;
  ip: string;
}) {
  return consume([
    {
      bucket: 'exchange',
      failClosed: true,
      key: `${KEY_PREFIX}:exchange:app:${keyPart(appId)}:ip:${keyPart(ip)}`,
    },
  ]);
}
