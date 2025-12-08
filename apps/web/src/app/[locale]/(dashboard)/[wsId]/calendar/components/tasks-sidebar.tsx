import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { ExtendedWorkspaceTask } from '../../time-tracker/types';
import { CalendarSidebar } from './sidebar';

interface TasksSidebarProps {
  wsId: string;
  locale: string;
}

export default async function TasksSidebar({
  wsId,
  locale,
}: TasksSidebarProps) {
  const user = await getCurrentUser();

  if (!user?.id) {
    return <div>Error: User not found</div>;
  }

  // Resolve workspace ID (handles "personal", "internal", etc.)
  const workspace = await getWorkspace(wsId);
  const resolvedWsId = workspace?.id;

  // Use the same RPC as the tasks page to get accessible tasks
  const supabase = await createClient();
  const { data: rpcTasks } = await supabase.rpc('get_user_accessible_tasks', {
    p_user_id: user.id,
    p_ws_id: resolvedWsId,
    p_include_deleted: false,
    p_list_statuses: ['not_started', 'active'],
  });

  // Map RPC results to match expected structure (same as my-tasks-data-loader.tsx)
  const tasks = (rpcTasks?.map((task) => ({
    id: task.task_id,
    name: task.task_name,
    description: task.task_description,
    creator_id: task.task_creator_id,
    list_id: task.task_list_id,
    start_date: task.task_start_date,
    end_date: task.task_end_date,
    due_date: task.task_end_date, // Map end_date to due_date for display
    priority: task.task_priority,
    completed_at: task.task_completed_at,
    closed_at: task.task_closed_at,
    deleted_at: task.task_deleted_at,
    estimation_points: task.task_estimation_points,
    created_at: task.task_created_at,
    calendar_hours: task.task_calendar_hours,
    total_duration: task.task_total_duration,
    is_splittable: task.task_is_splittable,
    min_split_duration_minutes: task.task_min_split_duration_minutes,
    max_split_duration_minutes: task.task_max_split_duration_minutes,
  })) || []) as ExtendedWorkspaceTask[];

  // Personal workspace = workspace ID matches user ID (no need for auto-assignment)
  const isPersonalWorkspace = resolvedWsId === user.id;

  return (
    <CalendarSidebar
      wsId={wsId}
      assigneeId={user.id}
      tasks={tasks}
      locale={locale}
      isPersonalWorkspace={isPersonalWorkspace}
    />
  );
}
