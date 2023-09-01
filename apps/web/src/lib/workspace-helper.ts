import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Workspace } from '@/types/primitives/Workspace';
import { ROOT_WORKSPACE_ID } from '@/constants/common';

export async function getWorkspace(id?: string) {
  if (!id) notFound();

  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, preset, created_at, workspace_members!inner(role)')
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
    .select('id, name, preset, created_at, workspace_members!inner(role)')
    .eq('workspace_members.user_id', user.id);

  if (error) notFound();

  return data as Workspace[];
}
export function enforceRootWorkspace(wsId: string) {
  if (wsId !== ROOT_WORKSPACE_ID) notFound();
}

export async function enforceRootWorkspaceAdmin(wsId: string) {
  enforceRootWorkspace(wsId);

  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .eq('role', 'OWNER')
    .single();

  if (error) notFound();
}
