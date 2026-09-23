import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { AppCoordinationTokenClaims } from './app-coordination';

export function createAppSessionUser(
  claims: AppCoordinationTokenClaims
): SupabaseUser {
  const timestamp = new Date(claims.iat * 1000).toISOString();

  return {
    app_metadata: {},
    aud: 'authenticated',
    confirmed_at: timestamp,
    created_at: timestamp,
    email: claims.email ?? undefined,
    id: claims.sub,
    identities: [],
    role: 'authenticated',
    updated_at: timestamp,
    user_metadata: {
      origin_app: claims.origin_app,
      target_app: claims.target_app,
    },
  } as SupabaseUser;
}

export function getSupabaseAuthClaimsForUser(user: SupabaseUser) {
  const sessionUser = user as SupabaseUser & {
    app_metadata?: Record<string, unknown>;
    aud?: string | null;
    role?: string | null;
    user_metadata?: Record<string, unknown>;
  };

  return {
    app_metadata: sessionUser.app_metadata ?? {},
    aud: sessionUser.aud ?? 'authenticated',
    email: user.email ?? null,
    role: sessionUser.role ?? 'authenticated',
    sub: user.id,
    user_metadata: sessionUser.user_metadata ?? {},
  };
}
