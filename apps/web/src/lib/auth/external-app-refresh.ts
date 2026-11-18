import {
  type AppCoordinationTokenClaims,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import {
  APP_TOKEN_REFRESH_SCOPE,
  readRefreshFamily,
} from '@/lib/app-coordination/refresh-family';
import { consumeRefreshTokenWithGrace } from '@/lib/app-coordination/refresh-replay';

const REFRESH_REPLAY_KEY_PREFIX = 'app-token:refresh:used';
const REFRESH_FAMILY_REVOKED_KEY_PREFIX = 'app-token:refresh:family-revoked';

export type ExternalAppRefreshResult =
  | { claims: AppCoordinationTokenClaims; family: string | null }
  | 'limited'
  | 'unavailable'
  | null;

/**
 * Verifies and consumes an external-app refresh token. Callers have already
 * checked the app secret, so the replay pre-limit is keyed on the app and the
 * token's rotation family instead of the source IP: one app server refreshing
 * for many users shares an egress IP. Reusing a rotated token outside the
 * replay grace revokes its whole family until the newest possible successor
 * expires (`familyTtlSeconds`, the refresh-token lifetime).
 */
export async function verifyExternalAppRefreshToken({
  familyTtlSeconds,
  ip,
  replayGraceSeconds,
  refreshToken,
  targetApp,
}: {
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

  const family = readRefreshFamily(claims.scopes);
  const consumeResult = await consumeRefreshTokenWithGrace({
    keyPrefix: REFRESH_REPLAY_KEY_PREFIX,
    onError: (error) =>
      console.warn('External app refresh replay check failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    exp: claims.exp,
    family: family
      ? {
          key: `${REFRESH_FAMILY_REVOKED_KEY_PREFIX}:${targetApp}:${family}`,
          ttlSeconds: familyTtlSeconds,
        }
      : undefined,
    graceSeconds: replayGraceSeconds,
    ip,
    jti: claims.jti,
    preLimit: {
      ip: null,
      principal: family
        ? `app:${targetApp}:family:${family}`
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
  // Legacy policy continues without the fence; once the guard store owns
  // replay fences, an unavailable store fails closed.
  if (consumeResult === 'unavailable' && isAbuseGuardFamilyAssigned('replay')) {
    return 'unavailable';
  }

  return { claims, family };
}
