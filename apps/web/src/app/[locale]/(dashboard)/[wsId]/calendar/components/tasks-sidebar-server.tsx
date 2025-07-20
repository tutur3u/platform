import TasksSidebarContent from './tasks-sidebar-content';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';

export default async function TasksSidebarServer({
  wsId,
  ...props
}: {
  wsId: string;
}) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return <div>Error: User not found</div>;
  }
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('creator_id', user.id);

  if (error) {
    console.error('Error fetching tasks:', error);
    return <div>Error loading tasks</div>;
  }

  return <TasksSidebarContent wsId={wsId} tasks={data || []} {...props} />;
}
