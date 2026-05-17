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
  workspace_user_id?: string | null;
  workspace_profile_display_name?: string | null;
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

interface WorkspaceUserLinkRow {
  platform_user_id: string;
  virtual_user_id: string;
  workspace_users: {
    id: string;
    display_name: string | null;
    full_name: string | null;
    email: string | null;
  } | null;
}

interface WorkspaceProfileRow {
  id: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
}

const normalizeEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() || null;

const normalizeName = (name: string | null | undefined) => name?.trim() || null;

export const resolveWorkspaceMemberDisplayName = ({
  workspaceDisplayName,
  workspaceFullName,
  userDisplayName,
}: {
  workspaceDisplayName?: string | null;
  workspaceFullName?: string | null;
  userDisplayName?: string | null;
}) =>
  normalizeName(workspaceDisplayName) ??
  normalizeName(workspaceFullName) ??
  normalizeName(userDisplayName);

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

  const memberUserIds = [
    ...new Set(
      data.filter((member) => member.id).map((member) => member.id as string)
    ),
  ];

  const userIds = [
    ...new Set(
      data
        .filter((member) => !member.pending && member.id)
        .map((member) => member.id as string)
    ),
  ];

  const roleMembershipsData: WorkspaceRoleMembershipRow[] = [];
  if (userIds.length > 0) {
    const userIdBatchSize = 500;

    for (let index = 0; index < userIds.length; index += userIdBatchSize) {
      const userIdBatch = userIds.slice(index, index + userIdBatchSize);
      const { data: rawRoleMembershipsData, error: roleMembershipsError } =
        await supabase
          .from('workspace_role_members')
          .select(
            'user_id, workspace_roles!inner(id, name, ws_id, workspace_role_permissions(permission, enabled))'
          )
          .eq('workspace_roles.ws_id', wsId)
          .in('user_id', userIdBatch);

      if (roleMembershipsError) throw roleMembershipsError;
      roleMembershipsData.push(
        ...((rawRoleMembershipsData as WorkspaceRoleMembershipRow[] | null) ??
          [])
      );
    }
  }

  const { data: defaultPermissionsData, error: defaultPermissionsError } =
    await supabase
      .from('workspace_default_permissions')
      .select('permission, enabled')
      .eq('ws_id', wsId)
      .eq('member_type', 'MEMBER')
      .eq('enabled', true);

  if (defaultPermissionsError) throw defaultPermissionsError;

  const privateEmailByUserId = new Map<string, string | null>();
  if (memberUserIds.length > 0) {
    const { data: privateEmailData, error: privateEmailError } = await sbAdmin
      .from('user_private_details')
      .select('user_id, email')
      .in('user_id', memberUserIds);

    if (privateEmailError) throw privateEmailError;

    for (const row of privateEmailData ?? []) {
      privateEmailByUserId.set(row.user_id, normalizeEmail(row.email));
    }
  }

  const profileByUserId = new Map<string, WorkspaceProfileRow>();
  if (memberUserIds.length > 0) {
    const { data: linkData, error: linkError } = await sbAdmin
      .from('workspace_user_linked_users')
      .select(
        'platform_user_id, virtual_user_id, workspace_users!virtual_user_id(id, display_name, full_name, email)'
      )
      .eq('ws_id', wsId)
      .in('platform_user_id', memberUserIds);

    if (linkError) throw linkError;

    for (const row of (linkData ?? []) as WorkspaceUserLinkRow[]) {
      if (row.workspace_users) {
        profileByUserId.set(row.platform_user_id, row.workspace_users);
      }
    }
  }

  const profileLookupEmails = [
    ...new Set(
      data
        .map((member) =>
          normalizeEmail(
            member.email ??
              (member.id ? privateEmailByUserId.get(member.id) : null)
          )
        )
        .filter((email): email is string => !!email)
    ),
  ];
  const profileByEmail = new Map<string, WorkspaceProfileRow>();

  if (profileLookupEmails.length > 0) {
    const profileLookupEmailVariants = [
      ...new Set(
        profileLookupEmails.flatMap((email) => [email, email.toLowerCase()])
      ),
    ];
    const { data: profileData, error: profileError } = await sbAdmin
      .from('workspace_users')
      .select('id, display_name, full_name, email')
      .eq('ws_id', wsId)
      .in('email', profileLookupEmailVariants);

    if (profileError) throw profileError;

    const profilesByNormalizedEmail = new Map<string, WorkspaceProfileRow[]>();

    for (const profile of (profileData ?? []) as WorkspaceProfileRow[]) {
      const normalizedEmail = normalizeEmail(profile.email);
      if (!normalizedEmail) continue;

      const profiles = profilesByNormalizedEmail.get(normalizedEmail) ?? [];
      profiles.push(profile);
      profilesByNormalizedEmail.set(normalizedEmail, profiles);
    }

    for (const [email, profiles] of profilesByNormalizedEmail.entries()) {
      if (profiles.length === 1 && profiles[0]) {
        profileByEmail.set(email, profiles[0]);
      }
    }
  }

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

  return data.map(({ email, type, ...rest }) => {
    const normalizedEmail = normalizeEmail(
      email ?? (rest.id ? privateEmailByUserId.get(rest.id) : null)
    );
    const workspaceProfile =
      (rest.id ? profileByUserId.get(rest.id) : null) ??
      (normalizedEmail ? profileByEmail.get(normalizedEmail) : null) ??
      null;
    const workspaceProfileDisplayName = workspaceProfile?.display_name ?? null;
    const displayName = resolveWorkspaceMemberDisplayName({
      workspaceDisplayName: workspaceProfileDisplayName,
      workspaceFullName: workspaceProfile?.full_name ?? null,
      userDisplayName: rest.display_name,
    });

    return {
      ...rest,
      pending: rest.pending ?? undefined,
      workspace_member_type: type,
      display_name: hiddenSecrets.has('HIDE_MEMBER_NAME') ? null : displayName,
      email: hiddenSecrets.has('HIDE_MEMBER_EMAIL') ? null : email,
      is_creator: workspaceData.creator_id === rest.id,
      roles: rest.id ? (roleMap.get(rest.id) ?? []) : [],
      default_permissions: defaultPermissions,
      workspace_user_id: workspaceProfile?.id ?? null,
      workspace_profile_display_name: hiddenSecrets.has('HIDE_MEMBER_NAME')
        ? null
        : workspaceProfileDisplayName,
    };
  });
}
