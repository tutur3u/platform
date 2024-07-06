import { permissions as rolePermissions } from './permissions';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { PermissionId } from '@/types/db';
import { Workspace } from '@/types/primitives/Workspace';
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';
import { createAdminClient, createClient } from '@/utils/supabase/server';
import { notFound, redirect } from 'next/navigation';

export async function getWorkspace(id?: string) {
  if (!id) return null;

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, created_at, workspace_members!inner(role)'
    )
    .eq('id', id)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error || !data?.workspace_members[0]?.role) notFound();
  const { workspace_members, ...rest } = data;

  const ws = {
    ...rest,
    role: workspace_members[0]?.role,
  };

  return ws as Workspace;
}

export async function getWorkspaces(noRedirect?: boolean) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (noRedirect) return null;
    redirect('/login');
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, created_at, workspace_members!inner(role)'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) notFound();

  return data as Workspace[];
}

export async function getWorkspaceInvites() {
  const supabase = createClient();

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
        .eq('email', user.email)
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

  const supabase = createClient();

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
  requiredSecrets,
  forceAdmin = false,
}: {
  wsId?: string;
  requiredSecrets?: string[];
  forceAdmin?: boolean;
}) {
  const supabase = forceAdmin ? createAdminClient() : createClient();
  const queryBuilder = supabase.from('workspace_secrets').select('*');

  if (wsId) queryBuilder.eq('ws_id', wsId);
  if (requiredSecrets) queryBuilder.in('name', requiredSecrets);

  const { data, error } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    console.log(error);
    notFound();
  }

  return data as WorkspaceSecret[];
}

export async function verifyHasSecrets(
  wsId: string,
  requiredSecrets: string[],
  redirectPath?: string
) {
  const secrets = await getSecrets({ wsId, requiredSecrets, forceAdmin: true });

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

export function verifySecret(
  secretName: string,
  secretValue: string,
  secrets: WorkspaceSecret[]
) {
  const secret = getSecret(secretName, secrets);
  return secret?.value === secretValue;
}

export async function getPermissions({
  wsId,
  requiredPermissions,
  redirectTo,
  enableNotFound,
}: {
  wsId: string;
  requiredPermissions: PermissionId[];
  redirectTo?: string;
  enableNotFound?: boolean;
}) {
  const supabase = createClient();

  if (
    !requiredPermissions.every((p) =>
      rolePermissions().some((rp) => rp.id === p)
    )
  )
    throw new Error('Invalid permissions provided');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('User not found');

  const permissionsQuery = supabase
    .from('workspace_role_permissions')
    .select('permission, role_id')
    .eq('ws_id', wsId)
    .eq('enabled', true)
    .in('permission', requiredPermissions)
    .limit(requiredPermissions.length);

  const workspaceQuery = supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  const [permissionsRes, workspaceRes] = await Promise.all([
    permissionsQuery,
    workspaceQuery,
  ]);

  const { data: permissionsData, error } = permissionsRes;
  const { data: workspaceData, error: workspaceError } = workspaceRes;

  if (error) throw error;
  if (workspaceError) throw workspaceError;
  if (!workspaceData) throw new Error('Workspace not found');

  // console.log();
  // console.log('Is creator', workspaceData.creator_id === user.id);
  // console.log('Permissions', permissionsData.length > 0, permissionsData);
  // console.log();

  if (!permissionsData.length && !workspaceData.creator_id) {
    if (redirectTo) redirect(redirectTo);
    if (enableNotFound) notFound();
  }

  const permissions =
    workspaceData.creator_id === user.id
      ? rolePermissions().map(({ id }) => id)
      : permissionsData.map(({ permission }) => permission);

  return { permissions };
}
