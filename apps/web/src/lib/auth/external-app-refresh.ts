import {
  type AppCoordinationTokenClaims,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import { hasUpstashRestEnv } from '@tuturuuu/utils/upstash-rest';
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
 * `failClosed` refuses the refresh when a configured replay store is
 * unavailable. It is set for apps with a bearer cap; other apps keep the
 * legacy policy, which continues without the fence unless the guard store owns
 * replay fences. Outside production, an environment with no replay store at
 * all (local, preview or staging without Upstash and without an assigned
 * guard) uses the legacy policy for every app, so capped apps can still
 * refresh there. Production never takes that exemption: a capped app refuses
 * refresh whenever its replay fence cannot run.
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
  // Legacy policy continues without the fence. Every app fails closed once the
  // guard store owns replay fences; capped apps also fail closed whenever a
  // legacy store is configured but failing.
  if (
    consumeResult === 'unavailable' &&
    (isAbuseGuardFamilyAssigned('replay') ||
      (failClosed && (hasUpstashRestEnv() || !isNonProductionDeployment())))
  ) {
    return 'unavailable';
  }

  return { claims, family };
}

/** Deploy markers that name a non-production runtime. */
const NON_PRODUCTION_DEPLOY_ENVS = new Set([
  'development',
  'local',
  'preview',
  'staging',
  'test',
]);

/**
 * Whether this runtime is known not to be production. An explicit deploy
 * marker wins (`TUTURUUU_DEPLOY_ENV`, then `VERCEL_ENV`) and counts only when
 * it is an allow-listed non-production value; without one, only a development
 * or test `NODE_ENV` counts. Anything else, including an unknown marker or an
 * unmarked build, is treated as production.
 */
export function isNonProductionDeployment(
  env: Record<string, string | undefined> = process.env
) {
  const deploy = (env.TUTURUUU_DEPLOY_ENV || env.VERCEL_ENV)
    ?.trim()
    .toLowerCase();
  if (deploy) return NON_PRODUCTION_DEPLOY_ENVS.has(deploy);
  const node = env.NODE_ENV?.trim().toLowerCase();
  return node === 'development' || node === 'test';
}
