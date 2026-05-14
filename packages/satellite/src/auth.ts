import {
  type AppSessionTargetApp,
  getAppSessionClaimsFromRequest,
  getAppSessionUserFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  getCurrentUserProfile,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { headers } from 'next/headers';

export async function getSatelliteAppSession(targetApp?: AppSessionTargetApp) {
  const requestHeaders = await headers();

  return getAppSessionClaimsFromRequest(
    { headers: requestHeaders },
    targetApp ? { targetApp } : {}
  );
}

export async function getSatelliteAppSessionUser(
  targetApp?: AppSessionTargetApp
) {
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
  const appSession = getAppSessionClaimsFromRequest(
    {
      headers: requestHeaders,
    },
    targetApp ? { targetApp } : {}
  );

  if (!appSession) {
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
    return {
      email: appSession.email,
      id: appSession.sub,
    };
  }
}
