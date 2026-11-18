import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import type { AppCoordinationSessionPolicy } from '@tuturuuu/auth/app-session-policy';
import type { MfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import type { SessionAssurance } from '@tuturuuu/utils/session-assurance';
import { NextResponse } from 'next/server';

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
 * Ceiling for an external-app bearer's lifetime, whatever the session policy
 * says. Bearers cannot be revoked individually, so this bounds how long one
 * outlives a logout, a removed membership or a leaked copy; the registry and
 * membership are re-checked whenever the app refreshes.
 */
export const EXTERNAL_APP_BEARER_MAX_TTL_SECONDS = 900;

export function getExternalAppBearerLifetime(
  policy: Pick<
    AppCoordinationSessionPolicy,
    'externalAppBearerTtlSeconds' | 'internalAppRefreshEarlySeconds'
  >
) {
  const ttlSeconds = Math.min(
    policy.externalAppBearerTtlSeconds,
    EXTERNAL_APP_BEARER_MAX_TTL_SECONDS
  );

  return {
    // Leave most of the lifetime usable instead of refreshing on every call.
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
  mfa,
  normalizedWorkspaceId,
  policy,
  scopes,
  targetApp,
  userProfile,
  userId,
}: {
  /** Server-verified session assurance; null when unknown (treat as aal1). */
  assurance?: SessionAssurance | null;
  email: string | null;
  mfa: MfaSessionProof | null;
  normalizedWorkspaceId?: string | null;
  policy: AppCoordinationSessionPolicy;
  scopes: string[];
  targetApp: string;
  userProfile: ExchangeUserProfile;
  userId: string;
}) {
  const assuranceClaims = assurance
    ? { aal: assurance.aal, amr: assurance.amr }
    : {};
  const bearerLifetime = getExternalAppBearerLifetime(policy);
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
    scopes: ['app-token:refresh'],
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
