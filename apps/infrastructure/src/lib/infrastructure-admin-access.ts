import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

async function getInfrastructureSessionUser() {
  const user = await getSatelliteAppSessionUser('infra');

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { ok: true as const, user };
}

export async function authorizeInfrastructureAdminRequest(
  requiredPermission: PermissionId | PermissionId[] = 'view_infrastructure'
) {
  const session = await getInfrastructureSessionUser();
  if (!session.ok) return session;

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    user: session.user,
  });
  const requiredPermissions = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];

  if (
    !requiredPermissions.some((permission) =>
      permissions?.containsPermission(permission)
    )
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Infrastructure permission required' },
        { status: 403 }
      ),
    };
  }

  const sbAdmin: TypedSupabaseClient = await createAdminClient({
    noCookie: true,
  });

  return {
    ok: true as const,
    sbAdmin,
    user: session.user,
  };
}

export async function authorizeInfrastructureWorkspaceSecretsRequest() {
  return authorizeInfrastructureAdminRequest([
    'manage_workspace_secrets',
    'manage_workspace_roles',
  ]);
}

export async function authorizeInfrastructureWorkspaceRequest(
  wsId: string,
  permission: PermissionId
) {
  const session = await getInfrastructureSessionUser();
  if (!session.ok) return session;

  const permissions = await getPermissions({ user: session.user, wsId });
  if (!permissions?.containsPermission(permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    sbAdmin: await createAdminClient({ noCookie: true }),
    user: session.user,
    wsId: permissions.wsId,
  };
}
