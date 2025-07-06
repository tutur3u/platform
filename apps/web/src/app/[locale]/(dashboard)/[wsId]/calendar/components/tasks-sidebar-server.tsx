import { createAdminClient } from '@tuturuuu/supabase/next/server';
import TasksSidebarContent from './tasks-sidebar-content';

export default async function TasksSidebarServer({
  wsId,
  ...props
}: {
  wsId: string;
}) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('creator_id', wsId); // Filter by creator_id instead of workspace_id

  if (error) {
    console.error('Error fetching tasks:', error);
    return <div>Error loading tasks</div>;
  }

  return <TasksSidebarContent wsId={wsId} tasks={data || []} {...props} />;
}
