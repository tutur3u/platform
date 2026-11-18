import {
  type AppCoordinationTokenClaims,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import {
  APP_TOKEN_REFRESH_SCOPE,
  deriveLegacyRefreshFamily,
  readRefreshFamily,
} from '@/lib/app-coordination/refresh-family';
import { consumeRefreshTokenWithGrace } from '@/lib/app-coordination/refresh-replay';

const REFRESH_REPLAY_KEY_PREFIX = 'app-token:refresh:used';
const REFRESH_FAMILY_REVOKED_KEY_PREFIX = 'app-token:refresh:family-revoked';

export type ExternalAppRefreshResult =
  | { claims: AppCoordinationTokenClaims; family: string }
  | 'limited'
  | 'unavailable'
  | null;

/**
 * Verifies and consumes an external-app refresh token. Callers have already
 * checked the app secret, so the replay pre-limit is keyed on the app and the
 * token's rotation family instead of the source IP: one app server refreshing
 * for many users shares an egress IP. Reusing a rotated token outside the
 * replay grace revokes its whole family until the newest possible successor
 * expires (`familyTtlSeconds`, the refresh-token lifetime). A token issued
 * without a family gets one derived from its own id, so its successors and a
 * later reuse of it share the family.
 *
 * `failClosed` refuses the refresh when the replay store is unavailable. It is
 * set for apps with a bearer cap; other apps keep the legacy policy, which
 * continues without the fence unless the guard store owns replay fences.
 */
export async function verifyExternalAppRefreshToken({
  failClosed = false,
  familyTtlSeconds,
  ip,
  replayGraceSeconds,
  refreshToken,
  targetApp,
}: {
  failClosed?: boolean;
  familyTtlSeconds: number;
  ip: string;
  replayGraceSeconds: number;
  refreshToken: string;
  targetApp: string;
}): Promise<ExternalAppRefreshResult> {
  let verification: ReturnType<typeof verifyAppCoordinationToken>;

  try {
    verification = verifyAppCoordinationToken(refreshToken);
  } catch {
    return null;
  }

  if (!verification.ok) {
    return null;
  }

  const { claims } = verification;

  if (
    claims.target_app !== targetApp ||
    !claims.scopes.includes(APP_TOKEN_REFRESH_SCOPE)
  ) {
    return null;
  }

  const carriedFamily = readRefreshFamily(claims.scopes);
  const family =
    carriedFamily ??
    deriveLegacyRefreshFamily({ jti: claims.jti, sub: claims.sub, targetApp });
  const consumeResult = await consumeRefreshTokenWithGrace({
    keyPrefix: REFRESH_REPLAY_KEY_PREFIX,
    onError: (error) =>
      console.warn('External app refresh replay check failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    exp: claims.exp,
    family: {
      key: `${REFRESH_FAMILY_REVOKED_KEY_PREFIX}:${targetApp}:${family}`,
      ttlSeconds: familyTtlSeconds,
    },
    graceSeconds: replayGraceSeconds,
    ip,
    jti: claims.jti,
    preLimit: {
      ip: null,
      // A legacy token's derived family is unique per token, so pacing those
      // stays per user.
      principal: carriedFamily
        ? `app:${targetApp}:family:${carriedFamily}`
        : `app:${targetApp}:sub:${claims.sub}`,
    },
    sub: claims.sub,
  });

  if (consumeResult === 'replayed' || consumeResult === 'revoked') {
    return null;
  }
  if (consumeResult === 'limited') {
    return 'limited';
  }
  // Legacy policy continues without the fence; capped apps, and every app
  // once the guard store owns replay fences, fail closed instead.
  if (
    consumeResult === 'unavailable' &&
    (failClosed || isAbuseGuardFamilyAssigned('replay'))
  ) {
    return 'unavailable';
  }

  return { claims, family };
}
