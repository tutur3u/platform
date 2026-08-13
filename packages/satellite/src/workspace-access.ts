import {
  type AppSessionTargetApp,
  createAppSessionUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  getWorkspace,
  resolveWorkspaceIdForPrincipal,
} from '@tuturuuu/utils/workspace-helper';
import { headers } from 'next/headers';

export type SatelliteAppSessionAudience =
  | AppSessionTargetApp
  | readonly AppSessionTargetApp[];

export interface SatelliteRequestActorContext {
  admin: TypedSupabaseClient;
  user: SupabaseUser;
}

export async function resolveSatelliteRequestActor(
  request: Request,
  targetApp: SatelliteAppSessionAudience
): Promise<SatelliteRequestActorContext | null> {
  const appSessionToken = getAppSessionTokenFromRequest(request);

  if (appSessionToken) {
    const verification = verifyAppSessionRequest(request, { targetApp });
    if (!verification.ok) return null;

    return {
      admin: (await createAdminClient({
        noCookie: true,
      })) as TypedSupabaseClient,
      user: createAppSessionUser(verification.claims),
    };
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) return null;

  return {
    admin: (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
    user,
  };
}

export async function resolveSatellitePageActor(
  targetApp: SatelliteAppSessionAudience
): Promise<SatelliteRequestActorContext | null> {
  const requestLike = { headers: await headers() };
  const appSessionToken = getAppSessionTokenFromRequest(requestLike);

  if (appSessionToken) {
    const verification = verifyAppSessionRequest(requestLike, { targetApp });
    if (!verification.ok) return null;

    return {
      admin: (await createAdminClient({
        noCookie: true,
      })) as TypedSupabaseClient,
      user: createAppSessionUser(verification.claims),
    };
  }

  const supabase = (await createClient()) as TypedSupabaseClient;
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
  if (authError || !user) return null;

  return {
    admin: (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
    user,
  };
}

export async function getSatelliteWorkspace(
  targetApp: AppSessionTargetApp,
  wsId: string
) {
  const actor = await resolveSatellitePageActor(targetApp);
  if (!actor) return null;

  return getWorkspace(wsId, { useAdmin: true, user: actor.user });
}

export async function getSatelliteWorkspacePermissions(
  targetApp: AppSessionTargetApp,
  wsId: string
) {
  const actor = await resolveSatellitePageActor(targetApp);
  if (!actor) return null;

  return getPermissions({ user: actor.user, wsId });
}

export async function resolveSatelliteWorkspaceId(
  targetApp: AppSessionTargetApp,
  wsId: string
) {
  const actor = await resolveSatellitePageActor(targetApp);
  if (!actor) return null;

  return resolveWorkspaceIdForPrincipal({
    authorizationClient: actor.admin,
    principal: { email: actor.user.email ?? null, id: actor.user.id },
    wsId,
  });
}

export async function getSatelliteRequestWorkspaceAccess(
  request: Request,
  targetApp: SatelliteAppSessionAudience,
  wsId: string
) {
  const actor = await resolveSatelliteRequestActor(request, targetApp);
  if (!actor) return null;

  const permissions = await getPermissions({ user: actor.user, wsId });
  if (!permissions) return null;

  return {
    ...actor,
    permissions,
    wsId: permissions.wsId,
  };
}
