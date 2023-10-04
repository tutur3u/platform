import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Workspace } from '@/types/primitives/Workspace';
import { ROOT_WORKSPACE_ID } from '@/constants/common';
import { Database } from '@/types/supabase';

export async function getWorkspace(id: string) {
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

export async function getWorkspaces() {
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
