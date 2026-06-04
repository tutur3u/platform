import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import {
  APP_SESSION_SCOPE,
  type AppSessionTargetApp,
  getAppSessionClaimsFromRequest,
  getAppSessionUserFromRequest,
} from '@tuturuuu/auth/app-session';
import { getSupabaseSessionUser } from '@tuturuuu/auth/supabase-session-user';
import {
  getCurrentUserProfile,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { headers } from 'next/headers';

function createSupabaseBackedAppSession(
  user: SupabaseUser,
  targetApp?: AppSessionTargetApp
): AppCoordinationTokenClaims {
  const nowSeconds = Math.floor(Date.now() / 1000);

  return {
    aud: 'tuturuuu-api',
    email: user.email ?? null,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
    iss: 'tuturuuu',
    jti: `supabase:${user.id}:${nowSeconds}`,
    origin_app: 'web',
    scopes: [APP_SESSION_SCOPE],
    sub: user.id,
    target_app: targetApp ?? 'web',
    typ: 'app_coordination',
  };
}

export async function getSatelliteSupabaseSessionUser() {
  return getSupabaseSessionUser();
}

export async function getSatelliteAppSession(targetApp?: AppSessionTargetApp) {
  const supabaseUser = await getSatelliteSupabaseSessionUser();

  if (supabaseUser?.id) {
    return createSupabaseBackedAppSession(supabaseUser, targetApp);
  }

  const requestHeaders = await headers();

  return getAppSessionClaimsFromRequest(
    { headers: requestHeaders },
    targetApp ? { targetApp } : {}
  );
}

export async function getSatelliteAppSessionUser(
  targetApp?: AppSessionTargetApp
) {
  const supabaseUser = await getSatelliteSupabaseSessionUser();

  if (supabaseUser?.id) {
    return supabaseUser;
  }

  const requestHeaders = await headers();

  return getAppSessionUserFromRequest(
    { headers: requestHeaders },
    targetApp ? { targetApp } : {}
  );
}

export async function getSatelliteCurrentUser(
  targetApp?: AppSessionTargetApp
): Promise<WorkspaceUser | null> {
  const requestHeaders = await headers();
  const supabaseUser = await getSatelliteSupabaseSessionUser();
  const appSession = getAppSessionClaimsFromRequest(
    {
      headers: requestHeaders,
    },
    targetApp ? { targetApp } : {}
  );

  if (!supabaseUser && !appSession) {
    return null;
  }

  try {
    const profile = await getCurrentUserProfile(
      withForwardedInternalApiAuth(requestHeaders)
    );

    return {
      avatar_url: profile.avatar_url,
      created_at: profile.created_at,
      default_workspace_id: profile.default_workspace_id,
      display_name: profile.display_name,
      email: profile.email,
      full_name: profile.full_name,
      id: profile.id,
      name: profile.display_name ?? profile.full_name ?? undefined,
      new_email: profile.new_email,
    };
  } catch {
    if (supabaseUser) {
      return {
        avatar_url: supabaseUser.user_metadata?.avatar_url ?? null,
        created_at: supabaseUser.created_at ?? null,
        display_name: supabaseUser.user_metadata?.display_name ?? null,
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name ?? null,
        id: supabaseUser.id,
        name:
          supabaseUser.user_metadata?.display_name ??
          supabaseUser.user_metadata?.full_name ??
          supabaseUser.email,
        new_email: null,
      };
    }

    if (!appSession) {
      return null;
    }

    return {
      email: appSession.email,
      id: appSession.sub,
    };
  }
}
