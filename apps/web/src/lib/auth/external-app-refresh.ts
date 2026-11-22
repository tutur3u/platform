import {
  type AppCoordinationTokenClaims,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import { hasUpstashRestEnv } from '@tuturuuu/utils/upstash-rest';
import {
  APP_TOKEN_REFRESH_SCOPE,
  deriveLegacyRefreshFamily,
  readRefreshFamily,
} from '@/lib/app-coordination/refresh-family';
import {
  consumeRefreshTokenWithGrace,
  type RefreshFamilyFence,
} from '@/lib/app-coordination/refresh-replay';
import {
  checkRefreshGrant,
  type RefreshApp,
  type RefreshGrant,
} from './external-app-refresh-grant';

const REFRESH_REPLAY_KEY_PREFIX = 'app-token:refresh:used';
const REFRESH_FAMILY_REVOKED_KEY_PREFIX = 'app-token:refresh:family-revoked';

export type ExternalAppRefreshResult =
  | { claims: AppCoordinationTokenClaims; family: string }
  | 'limited'
  | 'unavailable'
  | null;

/**
 * Whether a refresh may proceed without its replay fence. Only a
 * non-production runtime with no replay store configured at all (local,
 * preview or staging without Upstash and without an assigned guard) qualifies;
 * production and every runtime with a configured store fail closed.
 */
function mayRefreshWithoutFence() {
  return (
    !isAbuseGuardFamilyAssigned('replay') &&
    !hasUpstashRestEnv() &&
    isNonProductionDeployment()
  );
}

/**
 * Verifies and consumes an external-app refresh token. Callers have already
 * checked the app secret and pass the registration it resolved, so the replay
 * pre-limit is keyed on the app and the token's rotation family instead of
 * the source IP: one app server refreshing for many users shares an egress IP.
 * Reusing a rotated token outside the replay grace revokes its whole family
 * until the newest possible successor expires (`familyTtlSeconds`, the
 * refresh-token lifetime). A token issued without a family gets one derived
 * from its own id, so its successors and a later reuse of it share the family.
 *
 * The fence fails closed for every app: an unavailable store answers
 * `unavailable` (503) unless `mayRefreshWithoutFence` exempts the runtime.
 * `checkRefreshGrant` re-checks the registry and workspace membership before
 * the fence records the token's first use: a refused grant revokes the
 * family, and a failed lookup records nothing, so a retry after the 503's
 * `Retry-After` is judged as a first use rather than a replay.
 */
export async function verifyExternalAppRefreshToken({
  admin,
  app,
  familyTtlSeconds,
  ip,
  replayGraceSeconds,
  refreshToken,
  targetApp,
}: {
  admin: TypedSupabaseClient;
  app: RefreshApp;
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
  const familyFence: RefreshFamilyFence = {
    key: `${REFRESH_FAMILY_REVOKED_KEY_PREFIX}:${targetApp}:${family}`,
    ttlSeconds: familyTtlSeconds,
  };
  const onError = (error: unknown) =>
    console.warn('External app refresh replay check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  let grant: RefreshGrant | undefined;
  const consumeResult = await consumeRefreshTokenWithGrace({
    admit: async () => {
      grant = await checkRefreshGrant(admin, app, claims);
      return grant === 'live'
        ? 'admit'
        : grant === 'revoked'
          ? 'refuse'
          : 'unavailable';
    },
    keyPrefix: REFRESH_REPLAY_KEY_PREFIX,
    onError,
    exp: claims.exp,
    family: familyFence,
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
  if (consumeResult === 'unavailable') {
    // A grant that ran and could not be read, or a fence store that is down
    // where no exemption applies.
    if (grant !== undefined || !mayRefreshWithoutFence()) return 'unavailable';
    // The exempt runtime has no fence store, so the grant runs on its own.
    grant = await checkRefreshGrant(admin, app, claims);
    if (grant !== 'live') return grant === 'revoked' ? null : 'unavailable';
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
