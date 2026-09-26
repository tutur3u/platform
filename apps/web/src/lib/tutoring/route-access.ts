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

  return { normalizedWsId: permissions?.wsId ?? wsId, permissions, user };
}
