import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionId } from '@tuturuuu/types';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function authorizeAiStudioWorkspaceRequest(
  workspaceAlias: string,
  requiredPermission: PermissionId
) {
  const user = await getSatelliteAppSessionUser('ai');
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const workspace = await getWorkspace(workspaceAlias, {
    useAdmin: true,
    user,
  });
  if (!workspace?.joined) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      ),
    };
  }

  const permissions = await getPermissions({ user, wsId: workspace.id });
  if (!permissions?.containsPermission(requiredPermission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    permissions,
    sbAdmin: await createAdminClient({ noCookie: true }),
    user,
    workspace,
  };
}
