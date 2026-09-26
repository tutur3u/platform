import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function authorizeAbuseIntelligenceRequest(
  request: Request,
  permission:
    | 'manage_workspace_roles'
    | 'view_infrastructure' = 'view_infrastructure'
) {
  const actor = await resolveSatelliteRequestActor(request, 'infra');

  if (!actor) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    user: actor.user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!permissions || permissions.withoutPermission(permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    sbAdmin: actor.admin as TypedSupabaseClient,
    supabase: actor.admin,
    user: actor.user,
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
