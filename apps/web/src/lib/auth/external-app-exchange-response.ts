import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import type { AppCoordinationSessionPolicy } from '@tuturuuu/auth/app-session-policy';
import type { MfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import type { SessionAssurance } from '@tuturuuu/utils/session-assurance';
import { NextResponse } from 'next/server';
import {
  newRefreshFamily,
  refreshTokenScopes,
} from '@/lib/app-coordination/refresh-family';

export type ExchangeUserProfile = {
  avatarUrl: string | null;
  avatar_url: string | null;
  displayName: string | null;
  display_name: string | null;
  email: string | null;
  fullName: string | null;
  full_name: string | null;
  id: string;
  name: string | null;
};

/**
 * Lifetime of an issued external-app bearer. Without a per-app cap the session
 * policy's TTL and refresh-early window apply unchanged. An app registered
 * with `maxBearerTtlSeconds` gets bearers no longer than the cap, and the
 * refresh-early window shrinks to a third of that lifetime so most of it stays
 * usable instead of refreshing on every call.
 */
export function getExternalAppBearerLifetime(
  policy: Pick<
    AppCoordinationSessionPolicy,
    'externalAppBearerTtlSeconds' | 'internalAppRefreshEarlySeconds'
  >,
  maxBearerTtlSeconds?: number | null
) {
  if (!maxBearerTtlSeconds) {
    return {
      refreshEarlySeconds: policy.internalAppRefreshEarlySeconds,
      ttlSeconds: policy.externalAppBearerTtlSeconds,
    };
  }

  const ttlSeconds = Math.min(
    policy.externalAppBearerTtlSeconds,
    maxBearerTtlSeconds
  );

  return {
    refreshEarlySeconds: Math.min(
      policy.internalAppRefreshEarlySeconds,
      Math.floor(ttlSeconds / 3)
    ),
    ttlSeconds,
  };
}

export function createExchangeTokenBody({
  assurance,
  email,
  maxBearerTtlSeconds,
  mfa,
  normalizedWorkspaceId,
  policy,
  refreshFamily = newRefreshFamily(),
  scopes,
  targetApp,
  userProfile,
  userId,
}: {
  /** Server-verified session assurance; null when unknown (treat as aal1). */
  assurance?: SessionAssurance | null;
  email: string | null;
  /** The app registry's bearer cap; null or omitted applies the policy TTL. */
  maxBearerTtlSeconds?: number | null;
  mfa: MfaSessionProof | null;
  normalizedWorkspaceId?: string | null;
  policy: AppCoordinationSessionPolicy;
  /** Rotation family carried from the presented refresh token, if any. */
  refreshFamily?: string;
  scopes: string[];
  targetApp: string;
  userProfile: ExchangeUserProfile;
  userId: string;
}) {
  const assuranceClaims = assurance
    ? { aal: assurance.aal, amr: assurance.amr }
    : {};
  const bearerLifetime = getExternalAppBearerLifetime(
    policy,
    maxBearerTtlSeconds
  );
  const accessToken = createAppCoordinationToken({
    ...assuranceClaims,
    email,
    mfa: mfa ?? undefined,
    expiresInSeconds: bearerLifetime.ttlSeconds,
    originApp: 'web',
    scopes,
    targetApp,
    userId,
  });
  const refreshToken = createAppCoordinationToken({
    ...assuranceClaims,
    email,
    mfa: mfa ?? undefined,
    expiresInSeconds: policy.internalAppRefreshTtlSeconds,
    originApp: 'web',
    scopes: refreshTokenScopes(refreshFamily),
    targetApp,
    userId,
  });

  return {
    ...(assurance
      ? {
          aal: assurance.aal,
          ...(assurance.amr?.length ? { amr: assurance.amr } : {}),
        }
      : {}),
    accessToken: accessToken.token,
    app: {
      name: accessToken.claims.target_app,
    },
    expiresAt: accessToken.expiresAt,
    expiresIn: accessToken.claims.exp - accessToken.claims.iat,
    refreshEarlySeconds: bearerLifetime.refreshEarlySeconds,
    refreshExpiresAt: refreshToken.expiresAt,
    refreshExpiresIn: refreshToken.claims.exp - refreshToken.claims.iat,
    refreshToken: refreshToken.token,
    scopes,
    tokenType: 'Bearer',
    user: userProfile,
    workspaceId: normalizedWorkspaceId,
  };
}

export async function createExchangeTokenResponse(
  input: Parameters<typeof createExchangeTokenBody>[0]
) {
  return NextResponse.json(createExchangeTokenBody(input));
}
