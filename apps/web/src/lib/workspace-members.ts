import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { User } from '@tuturuuu/types/primitives/User';

export interface WorkspaceMemberRole {
  id: string;
  name: string;
  permissions: Array<{ permission: string; enabled: boolean }>;
}

export interface WorkspaceDefaultPermission {
  permission: string;
  enabled: boolean;
}

export type EnhancedWorkspaceMember = User & {
  is_creator: boolean;
  roles: WorkspaceMemberRole[];
  default_permissions: WorkspaceDefaultPermission[];
};

interface GetWorkspaceMembersOptions {
  supabase: TypedSupabaseClient;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  status?: string | null;
}

interface WorkspaceRoleMembershipRow {
  user_id: string;
  workspace_roles: {
    id: string;
    name: string;
    workspace_role_permissions: WorkspaceDefaultPermission[] | null;
  };
}

export async function getWorkspaceMembers({
  supabase,
  sbAdmin,
  wsId,
  status,
}: GetWorkspaceMembersOptions): Promise<EnhancedWorkspaceMember[]> {
  const { data: secretData, error: secretError } = await sbAdmin
    .from('workspace_secrets')
    .select('name')
    .eq('ws_id', wsId)
    .in('name', ['HIDE_MEMBER_EMAIL', 'HIDE_MEMBER_NAME'])
    .eq('value', 'true');

  if (secretError) throw secretError;

  const queryBuilder = supabase
    .from('workspace_members_and_invites')
    .select(
      'id, handle, email, display_name, avatar_url, pending, created_at, type'
    )
    .eq('ws_id', wsId)
    .order('pending')
    .order('created_at', { ascending: false })
    .order('id', { ascending: true });

  if (status && status !== 'all') {
    queryBuilder.eq('pending', status === 'invited');
  }

  const { data, error } = await queryBuilder;
  if (error) throw error;

  const { data: workspaceData, error: workspaceError } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  if (workspaceError) throw workspaceError;

  const userIds = data
    .filter((member) => !member.pending && member.id)
    .map((member) => member.id as string);

  let roleMembershipsData: WorkspaceRoleMembershipRow[] = [];
  if (userIds.length > 0) {
    const { data: rawRoleMembershipsData, error: roleMembershipsError } =
      await supabase
        .from('workspace_role_members')
        .select(
          'user_id, workspace_roles!inner(id, name, ws_id, workspace_role_permissions(permission, enabled))'
        )
        .eq('workspace_roles.ws_id', wsId)
        .in('user_id', userIds);

    if (roleMembershipsError) throw roleMembershipsError;
    roleMembershipsData =
      (rawRoleMembershipsData as WorkspaceRoleMembershipRow[] | null) ?? [];
  }

  const { data: defaultPermissionsData, error: defaultPermissionsError } =
    await supabase
      .from('workspace_default_permissions')
      .select('permission, enabled')
      .eq('ws_id', wsId)
      .eq('enabled', true);

  if (defaultPermissionsError) throw defaultPermissionsError;

  const roleMap = new Map<string, WorkspaceMemberRole[]>();
  for (const membership of roleMembershipsData) {
    const roles = roleMap.get(membership.user_id) ?? [];
    roles.push({
      id: membership.workspace_roles.id,
      name: membership.workspace_roles.name,
      permissions: membership.workspace_roles.workspace_role_permissions ?? [],
    });
    roleMap.set(membership.user_id, roles);
  }

  const hiddenSecrets = new Set(
    (secretData ?? []).map((secret) => secret.name)
  );
  const defaultPermissions = defaultPermissionsData ?? [];

  return data.map(({ email, type, ...rest }) => ({
    ...rest,
    pending: rest.pending ?? undefined,
    workspace_member_type: type,
    display_name: hiddenSecrets.has('HIDE_MEMBER_NAME')
      ? null
      : rest.display_name,
    email: hiddenSecrets.has('HIDE_MEMBER_EMAIL') ? null : email,
    is_creator: workspaceData.creator_id === rest.id,
    roles: rest.id ? (roleMap.get(rest.id) ?? []) : [],
    default_permissions: defaultPermissions,
  }));
}
