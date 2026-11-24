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

  // Workspace secrets are platform-controlled. Only root-workspace secret or
  // role managers may read or write them, matching the root-only RLS policy on
  // public.workspace_secrets. A workspace-level `manage_workspace_secrets`
  // grant is not enough: workspace creators and `admin` members imply it for
  // their own workspace, and the credential Worker writes with the service
  // role, so this guard is the only check on that path.
  const rootPermissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });
  const canManageAsPlatformAdmin =
    rootPermissions?.containsPermission('manage_workspace_roles') ||
    rootPermissions?.containsPermission('manage_workspace_secrets') ||
    false;

  if (!canManageAsPlatformAdmin) {
    return {
      allowed: false as const,
      status: 403,
      message: 'Permission denied',
    };
  }

  return {
    allowed: true as const,
    db: await createAdminClient(),
    resolvedWsId,
  };
}
