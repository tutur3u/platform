import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
import { SessionHistory } from '../components/session-history';

export default async function TimeTrackerHistoryPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const user = await getCurrentSupabaseUser();
  const supabase = await createClient();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  if (!user) return notFound();

  const { data: categories } = await supabase
    .from('time_tracking_categories')
    .select('*')
    .eq('ws_id', wsId);

  const { data: sessions } = await supabase
    .from('time_tracking_sessions')
    .select('*, category:time_tracking_categories(*), task:tasks(*)')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .order('start_time', { ascending: false })
    .limit(100);

  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      `
      *,
      list:task_lists!inner(
        id,
        name,
        status,
        board:workspace_boards!inner(
          id,
          name,
          ws_id
        )
      ),
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url,
          user_private_details(email)
        )
      )
    `
    )
    .eq('list.board.ws_id', wsId)
    .eq('deleted', false)
    .eq('archived', false)
    .in('list.status', ['not_started', 'active']) // Only include tasks from not_started and active lists
    .eq('list.deleted', false)
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <SessionHistory
      wsId={wsId}
      sessions={sessions}
      categories={categories}
      tasks={tasks}
    />
  );
}
