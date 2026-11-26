import { abuseSubject } from '@tuturuuu/utils/abuse-protection/abuse-subject';
import { guardSourceBucket } from '@tuturuuu/utils/abuse-guard/source';
import {
  consume,
  counterStoreRequired,
  KEY_PREFIX,
  keyPart,
  limiterUnavailableResponse,
  rateLimitedResponse,
} from '@/lib/external-apps/rate-limit-core';
import { EXTERNAL_APP_RATE_LIMITS } from '@/lib/external-apps/rate-limit-policy';
import { getRedisClient } from '@/lib/rate-limit';
import { UPSKII_APP_ID } from './constants';
import type { AccountLinkRoute } from './rate-limit';

/**
 * Brute-force protection for the Upskii Basic app-credential routes
 * (introspect, link-status, unlink). The API proxy does not count their
 * `Basic` header as abuse, so the routes count their own failures. Everything
 * here is scoped to these routes; it never feeds the global edge IP block,
 * so a bad Upskii secret cannot cut a source off from other APIs.
 * - A source is the caller's Cloudflare Worker zone (`worker:<zone>`, from
 *   `cf-worker`) or its address grouped like the other limiters (IPv6 /64).
 * - Failures from an address source count per source and client id. Past
 *   `accountLinkAuthFailureSource` the pair is locked out of these routes
 *   until the window ends; a locked pair gets 429 before the secret check.
 *   Fixing the secret recovers it once the window ends.
 * - A Worker-zone source is never locked out. The real Upskii server calls
 *   from its Worker zone, and `cf-worker` is not proven for every client that
 *   egresses from Cloudflare (WARP, for example), so a lock there could be
 *   forged to keep Upskii out. Those failures still count toward the alert,
 *   and per-IP admission, failure pacing and the 256-bit secret bound
 *   guessing.
 * - An `unknown` source (no trusted client address, e.g. a broken
 *   trusted-proxy config or gateway proof secret) is never locked out either:
 *   every such caller would share one key, so one attacker could lock out
 *   the real server. The first such request from client id `upskii` per
 *   isolate is logged, because it means Upskii has lost its Worker zone.
 * - Failures per client id across all sources raise an alert past
 *   `accountLinkAuthFailure`. They never lock the client id out; its 256-bit
 *   secret is what defeats a distributed guesser.
 * - Every counter fails closed: without its store these routes answer 503.
 */
export function upskiiAuthSource(headers: Headers, ip: string) {
  const subject = abuseSubject(headers, ip);
  return subject.startsWith('worker:') ? subject : guardSourceBucket(ip);
}

function isLockableSource(source: string) {
  return !source.startsWith('worker:') && source !== 'unknown';
}

let unknownUpskiiSourceLogged = false;

/** Logs once per isolate when Upskii's own client id has no usable source. */
export function noteUpskiiAuthSource(source: string, appId: string) {
  if (
    unknownUpskiiSourceLogged ||
    source !== 'unknown' ||
    appId !== UPSKII_APP_ID
  )
    return;
  unknownUpskiiSourceLogged = true;
  console.warn('[upskii-link] request has no trusted source', {
    code: 'UPSKII_AUTH_SOURCE_UNKNOWN',
  });
}

/** Test hook: lets the once-per-isolate log fire again. */
export function resetUpskiiAuthSourceNoteForTests() {
  unknownUpskiiSourceLogged = false;
}

function lockKey(source: string, appId: string) {
  return `ratelimit:${KEY_PREFIX}:account-link:auth-lock:${keyPart(source)}:app:${keyPart(appId)}`;
}

function storeDown() {
  return counterStoreRequired() ? limiterUnavailableResponse() : null;
}

/** The 429 for a source and client id locked out after failed checks. */
export async function refuseLockedUpskiiAuthSource(
  source: string,
  appId: string
) {
  if (!isLockableSource(source)) return null;
  const redis = await getRedisClient();
  if (!redis) return storeDown();
  try {
    const key = lockKey(source, appId);
    if (!(await redis.get(key))) return null;
    const ttl = await redis.ttl(key);
    return rateLimitedResponse(
      Math.max(1, ttl),
      EXTERNAL_APP_RATE_LIMITS.accountLinkAuthFailureSource.maxRequests
    );
  } catch {
    return storeDown();
  }
}

async function lockOut(source: string, appId: string, response: Response) {
  const seconds = Math.max(
    1,
    Number(response.headers.get('Retry-After')) ||
      Math.ceil(
        EXTERNAL_APP_RATE_LIMITS.accountLinkAuthFailureSource.windowMs / 1000
      )
  );
  try {
    const redis = await getRedisClient();
    await redis?.set(lockKey(source, appId), '1', { ex: seconds });
  } catch {
    // The failure counter still answers 429 until its window ends.
  }
}

/**
 * Records one failed credential check. Returns 429 once this source and
 * client id pass the failure cap, 503 when the counter store is down, or
 * null to answer the caller's usual 401.
 */
export async function recordUpskiiAuthFailure({
  appId,
  reason,
  route,
  source,
}: {
  appId: string;
  reason: 'app' | 'header' | 'secret';
  route: AccountLinkRoute;
  source: string;
}) {
  const [sourceRefusal, surge] = await Promise.all([
    isLockableSource(source)
      ? consume([
          {
            bucket: 'accountLinkAuthFailureSource',
            failClosed: true,
            key: `${KEY_PREFIX}:account-link:auth-failure:source:${keyPart(source)}:app:${keyPart(appId)}`,
          },
        ])
      : null,
    consume([
      {
        bucket: 'accountLinkAuthFailure',
        failClosed: true,
        key: `${KEY_PREFIX}:account-link:auth-failure:app:${keyPart(appId)}`,
      },
    ]),
  ]);

  if (surge?.status === 429) {
    console.error('[upskii-link] credential failure surge', {
      appId: keyPart(appId),
      code: 'UPSKII_AUTH_FAILURE_SURGE',
      reason,
      route,
    });
  }

  if (sourceRefusal?.status === 429)
    await lockOut(source, appId, sourceRefusal);
  if (sourceRefusal) return sourceRefusal;
  // The client-id counter alerts but never locks out; only a store outage
  // refuses here, so guesses are never unlimited while it is down.
  return surge?.status === 503 ? surge : null;
}
