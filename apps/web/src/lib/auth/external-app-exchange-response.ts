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
  const accessToken = createAppCoordinationToken({
    ...assuranceClaims,
    email,
    mfa: mfa ?? undefined,
    expiresInSeconds: policy.externalAppBearerTtlSeconds,
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
    refreshEarlySeconds: policy.internalAppRefreshEarlySeconds,
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
