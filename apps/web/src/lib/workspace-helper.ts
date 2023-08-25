import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Workspace } from '@/types/primitives/Workspace';

export async function getWorkspace(id?: string | null) {
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
