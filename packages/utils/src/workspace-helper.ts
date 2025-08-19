import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  PermissionId,
  Workspace,
  WorkspaceUserRole,
} from '@tuturuuu/types/db';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { notFound, redirect } from 'next/navigation';
import { ROOT_WORKSPACE_ID } from './constants';
import { permissions as rolePermissions } from './permissions';

const isValidTuturuuuEmail = (email: string): boolean => {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@tuturuuu\.com$/;
  return emailRegex.test(email);
};

export async function checkTuturuuuAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .in('role', ['OWNER', 'ADMIN'])
    .single();

  if (error || !data) {
    console.error('Error checking Tuturuuu admin status:', error);
    throw error;
  }

  if (user.email && isValidTuturuuuEmail(user.email)) {
    return true;
  }
  return false;
}

// Structured logging utility
const logWorkspaceError = (
  context: string,
  error: any,
  metadata?: Record<string, any>
) => {
  const logData = {
    context,
    error: error?.message || error,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  console.error(`[WorkspaceHelper] ${context}:`, logData);
};

export async function getWorkspace(
  id: string,
  {
    requireUserRole = false,
  }: {
    requireUserRole?: boolean;
  } = {}
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const queryBuilder = supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, personal, created_at, workspace_members(role)'
    );

  if (id.toUpperCase() === 'PERSONAL') queryBuilder.eq('personal', true);
  else queryBuilder.eq('id', id);

  if (requireUserRole) queryBuilder.eq('workspace_members.user_id', user.id);
  const { data, error } = await queryBuilder.single();

  // If there's an error, log it for debugging with structured logging
  if (error) {
    logWorkspaceError('Failed to fetch workspace', error, {
      workspaceId: id,
      userId: user.id,
      requireUserRole,
      errorCode: error.code,
      errorDetails: error.details,
    });

    // Return null to let the caller handle the error appropriately
    // This allows for more graceful error handling in different contexts
    notFound();
  }

  const workspaceJoined = !!data?.workspace_members[0]?.role;
  const { workspace_members, ...rest } = data;

  const ws = {
    ...rest,
    role: workspace_members[0]?.role,
    joined: workspaceJoined,
  };

  return ws as Workspace & {
    role: WorkspaceUserRole;
    joined: boolean;
  };
}

export async function getWorkspaces() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, personal, created_at, workspace_members!inner(role)'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) {
    logWorkspaceError('Failed to fetch user workspaces', error, {
      userId: user.id,
      errorCode: error.code,
      errorDetails: error.details,
    });
    notFound();
  }

  return data;
}

export async function getWorkspaceInvites() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const invitesQuery = supabase
    .from('workspace_invites')
    .select('...workspaces(id, name), created_at')
    .eq('user_id', user.id);

  const emailInvitesQuery = user.email
    ? supabase
        .from('workspace_email_invites')
        .select('...workspaces(id, name), created_at')
        .ilike('email', `%${user.email}%`)
    : null;

  // use promise.all to run both queries in parallel
  const [invites, emailInvites] = await Promise.all([
    invitesQuery,
    emailInvitesQuery,
  ]);

  if (invites.error || emailInvites?.error)
    throw invites.error || emailInvites?.error;

  const data = [...invites.data, ...(emailInvites?.data || [])] as Workspace[];
  return data;
}

export function enforceRootWorkspace(
  wsId: string,
  options: {
    redirectTo?: string;
  } = {}
) {
  // Check if the workspace is the root workspace
  if (wsId === ROOT_WORKSPACE_ID) return;

  // If not, redirect to the provided path or 404
  if (options.redirectTo) redirect(options.redirectTo);
  else notFound();
}

export async function enforceRootWorkspaceAdmin(
  wsId: string,
  options: {
    redirectTo?: string;
  } = {}
) {
  enforceRootWorkspace(wsId, options);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .in('role', ['OWNER', 'ADMIN'])
    .single();

  if (error) {
    if (options.redirectTo) redirect(options.redirectTo);
    else notFound();
  }
}

export async function getSecrets({
  wsId,
  forceAdmin = false,
}: {
  wsId?: string;
  forceAdmin?: boolean;
}) {
  const supabase = await (forceAdmin ? createAdminClient() : createClient());
  const queryBuilder = supabase.from('workspace_secrets').select('*');

  if (wsId) queryBuilder.eq('ws_id', wsId);

  const { data, error } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    logWorkspaceError('Failed to fetch workspace secrets', error, {
      workspaceId: wsId,
      errorCode: error.code,
      errorDetails: error.details,
    });
    notFound();
  }

  return data as WorkspaceSecret[];
}

export async function verifyHasSecrets(
  wsId: string,
  requiredSecrets: string[],
  redirectPath?: string
) {
  const secrets = await getSecrets({ wsId, forceAdmin: true });

  const allSecretsVerified = requiredSecrets.every((secret) => {
    const { value } = getSecret(secret, secrets) || {};
    return value === 'true';
  });

  if (!allSecretsVerified && redirectPath) redirect(redirectPath);
  return allSecretsVerified;
}

export function getSecret(
  secretName: string,
  secrets: WorkspaceSecret[]
): WorkspaceSecret | undefined {
  return secrets.find(({ name }) => name === secretName);
}

export async function verifySecret({
  wsId,
  forceAdmin = false,
  name,
  value,
}: {
  wsId: string;
  forceAdmin?: boolean;
  name: string;
  value: string;
}) {
  const secrets = await getSecrets({ wsId, forceAdmin });
  const secret = getSecret(name, secrets);
  return secret?.value === value;
}

export async function getGuestGroup({ groupId }: { groupId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error('Unauthenticated access attempt in getGuestGroup');
    return null;
  }

  const { data, error } = await supabase.rpc('check_guest_group', {
    group_id: groupId,
  });

  if (error) {
    console.log(error);
    return null;
  }

  return data;
}
export async function getPermissions({
  wsId,
  redirectTo,
  enableNotFound,
}: {
  wsId: string;
  redirectTo?: string;
  enableNotFound?: boolean;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error('User not found');
    return {
      permissions: [],
      containsPermission: () => false,
      withoutPermission: () => true,
    };
  }

  const permissionsQuery = supabase
    .from('workspace_role_permissions')
    .select('permission, role_id')
    .eq('ws_id', wsId)
    .eq('enabled', true);

  const workspaceQuery = supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  const defaultQuery = supabase
    .from('workspace_default_permissions')
    .select('permission')
    .eq('ws_id', wsId)
    .eq('enabled', true);

  const [permissionsRes, workspaceRes, defaultRes] = await Promise.all([
    permissionsQuery,
    workspaceQuery,
    defaultQuery,
  ]);

  const { data: permissionsData, error: permissionsError } = permissionsRes;
  const { data: workspaceData, error: workspaceError } = workspaceRes;
  const { data: defaultData, error: defaultError } = defaultRes;

  if (!workspaceData) notFound();
  if (permissionsError) throw permissionsError;
  if (workspaceError) throw workspaceError;
  if (defaultError) throw defaultError;

  const hasPermissions = permissionsData.length > 0 || defaultData.length > 0;
  const isCreator = workspaceData.creator_id === user.id;

  // if (DEV_MODE) {
  //   console.log('--------------------');
  //   console.log('Is creator', isCreator);
  //   console.log('Workspace permissions', permissionsData);
  //   console.log('Default permissions', defaultData);
  //   console.log('Has permissions', hasPermissions);
  //   console.log('--------------------');
  // }

  if (!isCreator && !hasPermissions) {
    if (redirectTo) {
      // if (DEV_MODE) console.log('Redirecting to', redirectTo);
      redirect(redirectTo);
    }

    if (enableNotFound) {
      // if (DEV_MODE) console.log('Not found');
      notFound();
    }
  }

  const permissions = isCreator
    ? rolePermissions({ wsId, user }).map(({ id }) => id)
    : [...permissionsData, ...defaultData]
        .map(({ permission }) => permission)
        .filter((value, index, self) => self.indexOf(value) === index);

  const containsPermission = (permission: PermissionId) =>
    permissions.includes(permission);

  const withoutPermission = (permission: PermissionId) =>
    !containsPermission(permission);

  return { permissions, containsPermission, withoutPermission };
}

export async function getWorkspaceUser(id: string, userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('ws_id', id)
    .eq('platform_user_id', userId)
    .single();

  if (error) notFound();

  return data;
}

/**
 * Check if a workspace ID corresponds to a personal workspace
 * @param workspaceId - The workspace ID to check
 * @returns true if the workspace is personal, false otherwise
 */
export async function isPersonalWorkspace(
  workspaceId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('workspaces')
    .select('personal')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    console.error('Error checking if workspace is personal:', error);
    return false;
  }

  return data?.personal === true;
}
