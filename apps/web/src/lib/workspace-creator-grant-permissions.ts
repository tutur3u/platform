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
 * Roles among [roleIds] that hold an enabled creator-grant permission, or
 * null when the lookup fails so callers can fail closed.
 */
async function findCreatorGrantRoleIds(
  supabase: TypedSupabaseClient,
  { roleIds, wsId }: { roleIds: readonly string[]; wsId: string }
): Promise<null | string[]> {
  const { data, error } = await supabase
    .from('workspace_role_permissions')
    .select('role_id')
    .eq('ws_id', wsId)
    .in('role_id', [...roleIds])
    .eq('enabled', true)
    .in('permission', [...CREATOR_GRANT_PERMISSIONS]);

  if (error) return null;
  const rows = (data ?? []) as Array<{ role_id: string }>;
  return [...new Set(rows.map((row) => row.role_id))];
}

/**
 * Whether adding members to [roleId] would hand out a creator-grant
 * permission. Lookup failures count as true so callers fail closed.
 */
export async function roleHasCreatorGrantPermission(
  supabase: TypedSupabaseClient,
  { roleId, wsId }: { roleId: string; wsId: string }
): Promise<boolean> {
  const roleIds = await findCreatorGrantRoleIds(supabase, {
    roleIds: [roleId],
    wsId,
  });

  return roleIds === null || roleIds.length > 0;
}

/**
 * Whether the caller may put [roleIds] on a pending invitation. Roles holding
 * a creator-grant permission need the workspace creator unless they are
 * already on the invitation ([loadAssignedRoleIds]); the database enforces the
 * same rule when the invitation is stored and accepted. Fails closed.
 */
export async function canAssignInvitationRoles(
  supabase: TypedSupabaseClient,
  {
    loadAssignedRoleIds,
    roleIds,
    userId,
    wsId,
  }: {
    loadAssignedRoleIds?: () => Promise<readonly string[]>;
    roleIds: readonly string[];
    userId: null | string | undefined;
    wsId: string;
  }
): Promise<boolean> {
  if (roleIds.length === 0) return true;

  const creatorGrantRoleIds = await findCreatorGrantRoleIds(supabase, {
    roleIds,
    wsId,
  });
  if (creatorGrantRoleIds === null) return false;
  if (creatorGrantRoleIds.length === 0) return true;
  if (await isWorkspaceCreator(supabase, wsId, userId)) return true;
  if (!loadAssignedRoleIds) return false;

  try {
    const assignedRoleIds = new Set(await loadAssignedRoleIds());
    return creatorGrantRoleIds.every((roleId) => assignedRoleIds.has(roleId));
  } catch {
    return false;
  }
}
