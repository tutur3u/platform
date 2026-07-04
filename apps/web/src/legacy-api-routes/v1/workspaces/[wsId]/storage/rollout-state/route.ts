import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getWorkspaceStorageRolloutState } from '@/lib/workspace-storage-migration';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

function canManageSecretsForWorkspace(
  workspacePermissions: Awaited<ReturnType<typeof getPermissions>>,
  rootPermissions: Awaited<ReturnType<typeof getPermissions>>
) {
  return (
    workspacePermissions?.containsPermission('manage_workspace_secrets') ||
    rootPermissions?.containsPermission('manage_workspace_roles') ||
    rootPermissions?.containsPermission('manage_workspace_secrets')
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const auth = await resolveWorkspaceStorageRouteAuth(request, wsId);
    if (!auth.ok) {
      return auth.response;
    }
    const { normalizedWsId, user } = auth.context;
    const [workspacePermissions, rootPermissions] = await Promise.all([
      getPermissions({ user, wsId: normalizedWsId }),
      getPermissions({ user, wsId: ROOT_WORKSPACE_ID }),
    ]);

    if (!canManageSecretsForWorkspace(workspacePermissions, rootPermissions)) {
      return NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const data = await getWorkspaceStorageRolloutState(normalizedWsId);

    return NextResponse.json({ data });
  } catch (error) {
    logWorkspaceStorageRouteError(
      'Workspace storage rollout state error:',
      error
    );
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
