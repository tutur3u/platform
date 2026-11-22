import {
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import { guardSourceBucket } from '@tuturuuu/utils/abuse-guard/source';
import { UNKNOWN_CLIENT_IP } from '@tuturuuu/utils/abuse-protection/client-ip';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
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
 * The key part for the workspace the bearer is bound to, when the URL names
 * exactly that workspace. Only a bound workspace gets workspace counters, so
 * a token cannot spend another workspace's budget and URL strings never mint
 * keys before the handler authorizes them. Handles and `personal` are not
 * resolved here, so their requests count per user only.
 */
function boundWorkspaceKeyPart(wsId: string, boundWorkspaceId?: string) {
  const bound = boundWorkspaceId?.toLowerCase();
  if (!bound) return null;
  return resolveWorkspaceId(wsId).toLowerCase() === bound
    ? keyPart(bound)
    : null;
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

/**
 * The counters one external-app workspace request consumes. Every bucket is
 * counted per app and user, which caps a bearer however its URL names the
 * workspace; a bound workspace also gets a per-app workspace counter.
 */
export function externalAppWorkspaceCounters({
  appId,
  boundWorkspaceId,
  method,
  pattern,
  userId,
  wsId,
}: {
  appId: string;
  boundWorkspaceId?: string;
  method: string;
  pattern: readonly string[];
  userId: string;
  wsId: string;
}): Counter[] {
  const route = pattern.join('/');
  const app = keyPart(appId);
  const user = keyPart(userId);
  const workspace = boundWorkspaceKeyPart(wsId, boundWorkspaceId);
  const countersFor = (
    bucket: ExternalAppRateLimitBucket,
    { perWorkspace = true } = {}
  ): Counter[] => {
    // Reads fail open, as `checkRateLimit` does: a read changes nothing and
    // sends nothing, so a limiter outage should not take the app's reads down.
    const failClosed = bucket !== 'read';
    const prefix = `${KEY_PREFIX}:${bucket}:app:${app}`;
    return [
      { bucket, failClosed, key: `${prefix}:user:${user}` },
      ...(workspace && perWorkspace
        ? [{ bucket, failClosed, key: `${prefix}:ws:${workspace}` }]
        : []),
    ];
  };

  if (READ_METHODS.has(method) || READ_ROUTES.has(`${method} ${route}`)) {
    return countersFor('read');
  }

  const counters = countersFor('write');
  if (route === 'drive/upload-url') {
    counters.push(...countersFor('uploadUrl', { perWorkspace: false }));
  }
  if (route === 'members/invitations') {
    counters.push(...countersFor('invitation'));
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
      boundWorkspaceId: verification.claims.workspace_id,
      method,
      pattern,
      userId: verification.claims.sub,
      wsId,
    })
  );
  return refusal ?? undefined;
}

/**
 * Limits a cross-app token exchange per app and trusted client IP, with IPv6
 * counted per /64. Without a trusted IP every client of the app would share
 * one small bucket, so those exchanges get a larger per-app ceiling instead.
 */
export function limitExternalAppTokenExchange({
  appId,
  ip,
}: {
  appId: string;
  ip: string;
}) {
  const app = keyPart(appId);
  const source = guardSourceBucket(ip);
  if (source === UNKNOWN_CLIENT_IP) {
    console.warn('External app token exchange has no trusted client IP', {
      appId: app,
      code: 'EXCHANGE_CLIENT_IP_UNKNOWN',
    });
    return consume([
      {
        bucket: 'exchangeUnknownIp',
        failClosed: true,
        key: `${KEY_PREFIX}:exchangeUnknownIp:app:${app}`,
      },
    ]);
  }
  return consume([
    {
      bucket: 'exchange',
      failClosed: true,
      key: `${KEY_PREFIX}:exchange:app:${app}:ip:${keyPart(source)}`,
    },
  ]);
}
