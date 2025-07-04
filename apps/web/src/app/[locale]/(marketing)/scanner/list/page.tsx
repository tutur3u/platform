import StudentListClient from './client';
import { createClient } from '@ncthub/supabase/next/server';
import { redirect } from 'next/navigation';

export default async function Page() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) redirect('/');

  const { data: workspaces, error: workspaceError } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('user_id', user.id);

  if (workspaces?.length === 0 || workspaceError) redirect('/scanner');

  return <StudentListClient />;
}
