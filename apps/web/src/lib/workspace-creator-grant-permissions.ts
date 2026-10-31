import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  CREATOR_GRANT_PERMISSIONS,
  isCreatorGrantPermission,
  withoutCreatorGrantPermissions,
} from '@tuturuuu/utils/creator-grant-permissions';

type RolePermissionPayload = { enabled: boolean; id: string };
type CreatorGrantRoleDetails = {
  roleIds: string[];
  workspaceIds: string[];
};

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
 * Roles among [roleIds] that hold a creator-grant permission row, or
 * null when the lookup fails so callers can fail closed.
 */
async function findCreatorGrantRoleDetails(
  supabase: TypedSupabaseClient,
  {
    includeDisabled = false,
    roleIds,
    wsId,
  }: {
    includeDisabled?: boolean;
    roleIds: readonly string[];
    wsId: string;
  }
): Promise<CreatorGrantRoleDetails | null> {
  const uniqueRoleIds = [...new Set(roleIds)];
  if (uniqueRoleIds.length === 0) return { roleIds: [], workspaceIds: [] };

  const { data: roles, error: rolesError } = await supabase
    .from('workspace_roles')
    .select('id,ws_id')
    .in('id', uniqueRoleIds);

  if (
    rolesError ||
    (roles ?? []).length !== uniqueRoleIds.length ||
    (roles ?? []).some((role) => role.ws_id !== wsId)
  ) {
    return null;
  }

  let permissionQuery = supabase
    .from('workspace_role_permissions')
    .select('role_id,ws_id')
    .in('role_id', uniqueRoleIds)
    .in('permission', [...CREATOR_GRANT_PERMISSIONS]);
  if (!includeDisabled) permissionQuery = permissionQuery.eq('enabled', true);
  const { data, error } = await permissionQuery;

  if (error) return null;
  const rows = (data ?? []) as Array<{ role_id: string; ws_id: string }>;
  return {
    roleIds: [...new Set(rows.map((row) => row.role_id))],
    workspaceIds: [...new Set(rows.map((row) => row.ws_id))],
  };
}

/**
 * Creator-granted roles among [roleIds], or null when role ownership or the
 * permission lookup cannot be confirmed.
 */
async function findCreatorGrantRoleIds(
  supabase: TypedSupabaseClient,
  {
    includeDisabled = false,
    roleIds,
    wsId,
  }: { includeDisabled?: boolean; roleIds: readonly string[]; wsId: string }
): Promise<null | string[]> {
  const details = await findCreatorGrantRoleDetails(supabase, {
    includeDisabled,
    roleIds,
    wsId,
  });
  return details?.roleIds ?? null;
}

async function isCreatorOfEveryWorkspace(
  supabase: TypedSupabaseClient,
  workspaceIds: readonly string[],
  userId: null | string | undefined
): Promise<boolean> {
  if (!userId) return false;
  const uniqueWorkspaceIds = [...new Set(workspaceIds)];
  if (uniqueWorkspaceIds.length === 0) return true;

  const { data, error } = await supabase
    .from('workspaces')
    .select('id,creator_id')
    .in('id', uniqueWorkspaceIds);

  return (
    !error &&
    (data ?? []).length === uniqueWorkspaceIds.length &&
    (data ?? []).every((workspace) => workspace.creator_id === userId)
  );
}

/**
 * Whether adding members to [roleId] would hand out a creator-grant
 * permission. Lookup failures count as true so callers fail closed. Pass
 * [includeDisabled] when the caller may later enable the role's permissions.
 */
export async function roleHasCreatorGrantPermission(
  supabase: TypedSupabaseClient,
  {
    includeDisabled = false,
    roleId,
    wsId,
  }: { includeDisabled?: boolean; roleId: string; wsId: string }
): Promise<boolean> {
  const roleIds = await findCreatorGrantRoleIds(supabase, {
    includeDisabled,
    roleIds: [roleId],
    wsId,
  });

  return roleIds === null || roleIds.length > 0;
}

async function canManageCreatorGrantRoleWithPolicy(
  supabase: TypedSupabaseClient,
  {
    roleId,
    userId,
    wsId,
  }: { roleId: string; userId: null | string | undefined; wsId: string },
  includeDisabled: boolean
): Promise<boolean> {
  const details = await findCreatorGrantRoleDetails(supabase, {
    includeDisabled,
    roleIds: [roleId],
    wsId,
  });

  if (!details) return false;
  if (details.roleIds.length === 0) return true;

  for (const workspaceId of details.workspaceIds) {
    if (!(await isWorkspaceCreator(supabase, workspaceId, userId)))
      return false;
  }

  return true;
}

export function canManageCreatorGrantRole(
  supabase: TypedSupabaseClient,
  input: { roleId: string; userId: null | string | undefined; wsId: string }
): Promise<boolean> {
  return canManageCreatorGrantRoleWithPolicy(supabase, input, true);
}

/** Whether the caller may add members under the database enabled-grant rule. */
export function canAddCreatorGrantRoleMember(
  supabase: TypedSupabaseClient,
  input: { roleId: string; userId: null | string | undefined; wsId: string }
): Promise<boolean> {
  return canManageCreatorGrantRoleWithPolicy(supabase, input, false);
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

  const details = await findCreatorGrantRoleDetails(supabase, {
    roleIds,
    wsId,
  });
  if (details === null) return false;
  const creatorGrantRoleIds = details.roleIds;
  if (creatorGrantRoleIds.length === 0) return true;
  if (await isCreatorOfEveryWorkspace(supabase, details.workspaceIds, userId))
    return true;
  if (!loadAssignedRoleIds) return false;

  try {
    const assignedRoleIds = new Set(await loadAssignedRoleIds());
    return creatorGrantRoleIds.every((roleId) => assignedRoleIds.has(roleId));
  } catch {
    return false;
  }
}
