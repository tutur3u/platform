import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { getWorkspaceStorageRolloutState } from '@/lib/workspace-storage-migration';

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
    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const [workspacePermissions, rootPermissions] = await Promise.all([
      getPermissions({ wsId: normalizedWsId, request }),
      getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
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
    console.error('Workspace storage rollout state error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
