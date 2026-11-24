import { getWorkspaceStorageRolloutState } from '@tuturuuu/storage-core/workspace-storage-migration';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import {
  logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth,
} from '../route-auth';

/**
 * Storage provider rollout is platform-controlled: only root-workspace secret
 * or role managers may use it. A workspace-level grant is not enough, because
 * workspace creators and `admin` members imply manage_workspace_secrets for
 * their own workspace.
 */
function canManageSecretsForWorkspace(
  rootPermissions: Awaited<ReturnType<typeof getPermissions>>
) {
  return Boolean(
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
    const rootPermissions = await getPermissions({
      user,
      wsId: ROOT_WORKSPACE_ID,
    });

    if (!canManageSecretsForWorkspace(rootPermissions)) {
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
