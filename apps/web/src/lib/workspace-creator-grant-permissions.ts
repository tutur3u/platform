import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  CREATOR_GRANT_PERMISSIONS,
  isCreatorGrantPermission,
  withoutCreatorGrantPermissions,
} from '@tuturuuu/utils/creator-grant-permissions';

type RolePermissionPayload = { enabled: boolean; id: string };

export async function isWorkspaceCreator(
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: null | string | undefined
): Promise<boolean> {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .maybeSingle();

  return !error && data?.creator_id === userId;
}

/**
 * Role editors write with the admin client, so the database guard does not
 * see the caller. Keep creator-grant permissions (manage_subscription) in the
 * payload only when the caller is the workspace creator.
 */
export async function filterCreatorGrantPermissions(
  supabase: TypedSupabaseClient,
  {
    permissions,
    userId,
    wsId,
  }: {
    permissions: readonly RolePermissionPayload[];
    userId: null | string | undefined;
    wsId: string;
  }
): Promise<RolePermissionPayload[]> {
  if (
    !permissions.some((permission) => isCreatorGrantPermission(permission.id))
  )
    return [...permissions];

  return withoutCreatorGrantPermissions(
    permissions,
    await isWorkspaceCreator(supabase, wsId, userId)
  );
}

/**
 * Whether adding members to [roleId] would hand out a creator-grant
 * permission. Lookup failures count as true so callers fail closed.
 */
export async function roleHasCreatorGrantPermission(
  supabase: TypedSupabaseClient,
  { roleId, wsId }: { roleId: string; wsId: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('workspace_role_permissions')
    .select('permission')
    .eq('ws_id', wsId)
    .eq('role_id', roleId)
    .eq('enabled', true)
    .in('permission', [...CREATOR_GRANT_PERMISSIONS]);

  return Boolean(error) || (data?.length ?? 0) > 0;
}
