import {
  attachSupabaseAuthUser,
  getAppSessionUserFromRequest,
} from '@tuturuuu/auth/app-session';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { isTutoringEnabledForWorkspace } from './module-gate';

export async function createTutoringRequestClient(
  request: Request,
  user: SupabaseUser | null
) {
  return user
    ? attachSupabaseAuthUser(
        await createAdminClient({ noCookie: true, auditActorId: user.id }),
        user
      )
    : createClient(request);
}

export async function resolveTutoringRouteAccess(
  request: Request,
  wsId: string
) {
  const user = getAppSessionUserFromRequest(request, {
    targetApp: ['contacts', 'platform'],
  });
  const permissions = await getPermissions(
    user ? { user, wsId } : { request, wsId }
  );

  const normalizedWsId = permissions?.wsId ?? wsId;

  // A workspace that switched tutoring off answers like an unknown workspace:
  // every route already maps missing permissions to 404.
  if (permissions && !(await isTutoringEnabledForWorkspace(normalizedWsId))) {
    return { normalizedWsId, permissions: null, user };
  }

  return { normalizedWsId, permissions, user };
}
