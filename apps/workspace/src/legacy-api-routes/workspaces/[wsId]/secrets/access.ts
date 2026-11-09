import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

export async function getWorkspaceSecretsAccess(
  wsId: string,
  request?: Request
) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      allowed: false as const,
      status: 401,
      message: 'User not authenticated',
    };
  }

  const resolvedWsId = resolveWorkspaceId(wsId);

  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissions({ wsId: resolvedWsId, request }),
    getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
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
      allowed: false as const,
      status: 403,
      message: 'Permission denied',
    };
  }

  return {
    allowed: true as const,
    db: canManageAsPlatformAdmin ? await createAdminClient() : supabase,
    resolvedWsId,
  };
}
