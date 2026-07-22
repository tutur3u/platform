import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
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
  requiredPermission: PermissionId = 'view_infrastructure'
) {
  const session = await getInfrastructureSessionUser();
  if (!session.ok) return session;

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    user: session.user,
  });

  if (!permissions?.containsPermission(requiredPermission)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Infrastructure permission required' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    sbAdmin: await createAdminClient({ noCookie: true }),
    user: session.user,
  };
}

export async function authorizeInfrastructureWorkspaceSecretsRequest(
  wsId: string
) {
  const session = await getInfrastructureSessionUser();
  if (!session.ok) return session;

  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissions({ user: session.user, wsId }),
    getPermissions({ user: session.user, wsId: ROOT_WORKSPACE_ID }),
  ]);
  const canManageWorkspaceSecrets =
    workspacePermissions?.containsPermission('manage_workspace_secrets') ??
    false;
  const canManageAsPlatformAdmin =
    rootPermissions?.containsPermission('manage_workspace_roles') ||
    rootPermissions?.containsPermission('manage_workspace_secrets') ||
    false;

  if (!canManageWorkspaceSecrets && !canManageAsPlatformAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Workspace secret manager required' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true as const,
    sbAdmin: await createAdminClient({ noCookie: true }),
    user: session.user,
  };
}
