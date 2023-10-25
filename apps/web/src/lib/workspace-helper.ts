import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Workspace } from '@/types/primitives/Workspace';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { Database } from '@/types/supabase';
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';

export async function getWorkspace(id?: string) {
  if (!id) return null;

  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, preset, avatar_url, logo_url, created_at, workspace_members!inner(role)'
    )
    .eq('id', id)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (error || !data?.workspace_members[0]?.role) notFound();
  const { workspace_members, ...rest } = data;

  const ws = {
    ...rest,
    role: workspace_members[0].role,
  };

  return ws as Workspace;
}

export async function getWorkspaces(noRedirect?: boolean) {
  const supabase = createServerComponentClient({ cookies });

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
      'id, name, preset, avatar_url, logo_url, created_at, workspace_members!inner(role)'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) notFound();

  return data as Workspace[];
}

export async function getWorkspaceInvites() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspace_invites')
    .select('workspaces(id, name), created_at')
    .eq('user_id', user.id);

  if (error) throw error;

  const workspaces = data.map(({ workspaces, created_at }) => ({
    ...workspaces,
    created_at,
  }));

  return workspaces as Workspace[];
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

  const supabase = createServerComponentClient<Database>({ cookies });

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

export async function getSecrets(wsId: string, requiredSecrets?: string[]) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_secrets')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (requiredSecrets) {
    queryBuilder.in('name', requiredSecrets);
  }

  const { data, error } = await queryBuilder;
  if (error) throw error;
  return data as WorkspaceSecret[];
}

export function getSecret(
  secretName: string,
  secrets: WorkspaceSecret[]
): WorkspaceSecret | undefined {
  return secrets.find(({ name }) => name === secretName);
}
