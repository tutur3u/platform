import { guardSourceBucket } from '@tuturuuu/utils/abuse-guard/source';
import { UNKNOWN_CLIENT_IP } from '@tuturuuu/utils/abuse-protection/client-ip';
import { checkRateLimitRedis, getRedisClient } from '@/lib/rate-limit';
import {
  consume,
  counterStoreRequired,
  KEY_PREFIX,
  keyPart,
  limiterUnavailableResponse,
  rateLimitedResponse,
} from './rate-limit-core';
import { EXTERNAL_APP_RATE_LIMITS } from './rate-limit-policy';

/** The app an exchange names and the caller's trusted client IP. */
export type ExternalAppExchangeSource = { appId: string; ip: string };

/** The app and source key parts, with IPv6 counted per /64. */
function sourceKeys({ appId, ip }: ExternalAppExchangeSource) {
  const source = guardSourceBucket(ip);
  return {
    app: keyPart(appId),
    known: source !== UNKNOWN_CLIENT_IP,
    source: keyPart(source),
  };
}

const failureBlockKey = (app: string, source: string) =>
  `ratelimit:${KEY_PREFIX}:exchangeFailureBlock:app:${app}:ip:${source}`;

/**
 * Seconds left on the failed-secret block for this app and source, null when
 * none is active, or `unavailable` when the store cannot be read.
 */
async function failureBlockRetryAfter(app: string, source: string) {
  const redis = await getRedisClient();
  if (!redis) return 'unavailable' as const;
  try {
    const until = Number(await redis.get(failureBlockKey(app, source)));
    const retryAfter = Math.ceil(until - Date.now() / 1000);
    return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
  } catch {
    return 'unavailable' as const;
  }
}

/**
 * Admits an exchange attempt before any credential check. An app's server
 * calls the exchange for all of its users from a shared egress IP, so this
 * ceiling is high; the tight pacing applies only to failed credential checks
 * (see `paceExternalAppExchangeFailure`).
 * Without a trusted client IP every caller of the app shares one source, so
 * those attempts use a separate per-app ceiling.
 */
export async function admitExternalAppExchange(
  exchange: ExternalAppExchangeSource
) {
  const { app, known, source } = sourceKeys(exchange);
  if (!known) {
    console.warn('External app token exchange has no trusted client IP', {
      appId: app,
      code: 'EXCHANGE_CLIENT_IP_UNKNOWN',
    });
  }

  const [refusal, blocked] = await Promise.all([
    consume([
      known
        ? {
            bucket: 'exchangeAttempt',
            failClosed: true,
            key: `${KEY_PREFIX}:exchangeAttempt:app:${app}:ip:${source}`,
          }
        : {
            bucket: 'exchangeUnknownIp',
            failClosed: true,
            key: `${KEY_PREFIX}:exchangeUnknownIp:app:${app}`,
          },
    ]),
    failureBlockRetryAfter(app, source),
  ]);
  if (refusal) return refusal;
  if (blocked === 'unavailable') {
    return counterStoreRequired() ? limiterUnavailableResponse() : null;
  }
  return blocked
    ? rateLimitedResponse(
        blocked,
        EXTERNAL_APP_RATE_LIMITS.exchangeSecretFailure.maxRequests
      )
    : null;
}

/**
 * Paces a failed credential check for this app and source, returning the 429
 * to send once the failure limit is passed, or null to send the 401.
 *
 * A failed app secret also blocks every exchange attempt from that source
 * until the failure window ends, which stops secret guessing. Only the caller
 * chooses the secret, so the block cannot be aimed at an app's own servers.
 * A failed handoff or refresh token is paced without blocking: an app's
 * servers forward the tokens their users bring, so junk tokens sent through
 * an app must not lock out that app's valid exchanges.
 */
export async function paceExternalAppExchangeFailure(
  exchange: ExternalAppExchangeSource,
  credential: 'secret' | 'token'
) {
  const { app, source } = sourceKeys(exchange);
  const bucket =
    credential === 'secret' ? 'exchangeSecretFailure' : 'exchangeTokenFailure';
  const result = await checkRateLimitRedis(
    `${KEY_PREFIX}:${bucket}:app:${app}:ip:${source}`,
    EXTERNAL_APP_RATE_LIMITS[bucket]
  );
  if (result.allowed || result.unavailable) return null;

  const retryAfter = Math.max(1, result.reset - Math.floor(Date.now() / 1000));
  if (credential === 'secret') {
    const redis = await getRedisClient();
    try {
      await redis?.set(failureBlockKey(app, source), result.reset, {
        px: retryAfter * 1000,
      });
    } catch {
      console.warn('External app exchange failure block was not stored', {
        appId: app,
        code: 'EXCHANGE_FAILURE_BLOCK_UNSTORED',
      });
    }
  }
  return rateLimitedResponse(retryAfter, result.limit);
}

/** Counts a token exchange of a verified app, per app across all sources. */
export function limitVerifiedExternalAppExchange(appId: string) {
  return consume([
    {
      bucket: 'exchange',
      failClosed: true,
      key: `${KEY_PREFIX}:exchange:app:${keyPart(appId)}`,
    },
  ]);
}
