import { createHmac } from 'node:crypto';
import { getServerTokenSecretCandidates } from '@tuturuuu/auth/app-coordination';
import { guardSourceBucket } from '@tuturuuu/utils/abuse-guard/source';
import { UNKNOWN_CLIENT_IP } from '@tuturuuu/utils/abuse-protection/client-ip';
import { checkRateLimitRedis } from '@/lib/rate-limit';
import {
  consume,
  KEY_PREFIX,
  keyPart,
  rateLimitedResponse,
} from './rate-limit-core';
import { EXTERNAL_APP_RATE_LIMITS } from './rate-limit-policy';

/** The app an exchange names, the secret it presents and its client IP. */
export type ExternalAppExchangeSource = {
  appId: string;
  appSecret?: string;
  ip: string;
};

/** Label that derives the admission subkey from the token signing key. */
const ADMISSION_SUBKEY_LABEL = 'tuturuuu/external-app-exchange-admission/v1';

/**
 * A keyed digest of the presented app secret, so callers share an admission
 * bucket only when they hold the same secret and the counter key reveals
 * nothing about it. The HMAC key is a subkey derived from the server's
 * app-coordination signing secret, never that secret itself, so the counter
 * keys in the limiter store are no signing oracle over caller-chosen input.
 */
export function secretKeyPart(appSecret?: string) {
  if (!appSecret) return 'none';
  const [signingKey] = getServerTokenSecretCandidates();
  const subkey = createHmac('sha256', signingKey!)
    .update(ADMISSION_SUBKEY_LABEL)
    .digest();
  return createHmac('sha256', subkey).update(appSecret).digest('base64url');
}

/**
 * Admits an exchange attempt before the app secret is checked, per app and
 * presented secret. Keying on the secret rather than the client IP means a
 * flood from a shared egress (a Worker range, a NAT, an unknown IP) with
 * wrong secrets fills only its own buckets and never limits a caller that
 * holds the app's real secret.
 */
export function admitExternalAppExchange({
  appId,
  appSecret,
}: ExternalAppExchangeSource) {
  return consume([
    {
      bucket: 'exchangeAttempt',
      failClosed: true,
      key: `${KEY_PREFIX}:exchangeAttempt:app:${keyPart(appId)}:secret:${secretKeyPart(appSecret)}`,
    },
  ]);
}

/**
 * Paces a failed credential check per app and client IP (IPv6 per /64),
 * returning the 429 to send for this failed request once the failure limit
 * is passed, or null to send the 401. Only the failed request is answered
 * differently: a request whose credentials are valid is never refused here,
 * so failures sent under an app's id, or forwarded through an app's servers,
 * cannot lock out that app's valid exchanges.
 */
export async function paceExternalAppExchangeFailure(
  { appId, ip }: ExternalAppExchangeSource,
  credential: 'secret' | 'token'
) {
  const app = keyPart(appId);
  const source = guardSourceBucket(ip);
  if (source === UNKNOWN_CLIENT_IP) {
    console.warn('External app token exchange has no trusted client IP', {
      appId: app,
      code: 'EXCHANGE_CLIENT_IP_UNKNOWN',
    });
  }
  const bucket =
    credential === 'secret' ? 'exchangeSecretFailure' : 'exchangeTokenFailure';
  const result = await checkRateLimitRedis(
    `${KEY_PREFIX}:${bucket}:app:${app}:ip:${keyPart(source)}`,
    EXTERNAL_APP_RATE_LIMITS[bucket]
  );
  if (result.allowed || result.unavailable) return null;
  return rateLimitedResponse(
    Math.max(1, result.reset - Math.floor(Date.now() / 1000)),
    result.limit
  );
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
