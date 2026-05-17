import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function authorizeAbuseIntelligenceRequest(
  request: Request,
  permission:
    | 'manage_workspace_roles'
    | 'view_infrastructure' = 'view_infrastructure'
) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      supabase,
    };
  }

  const permissions = await getPermissions({
    request,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!permissions || permissions.withoutPermission(permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
      supabase,
    };
  }

  return {
    ok: true as const,
    supabase,
    user,
  };
}

export function defaultTrustMultiplierForTier(tier: string) {
  switch (tier) {
    case 'trusted':
      return 3;
    case 'watch':
      return 0.75;
    case 'restricted':
      return 0.35;
    default:
      return 1;
  }
}
