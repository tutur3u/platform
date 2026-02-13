import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';
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
  if (!workspace) notFound();
  const resolvedWsId = workspace.id;

  // Use the same RPC as the tasks page to get accessible tasks
  const supabase = await createClient();
  const { data: rpcTasks } = await supabase.rpc('get_user_accessible_tasks', {
    p_user_id: user.id,
    p_ws_id: resolvedWsId,
    p_include_deleted: false,
    p_list_statuses: ['not_started', 'active'],
  });

  // Map RPC results to match expected structure (same as my-tasks-data-loader.tsx)
  const tasksBase = (rpcTasks?.map((task) => ({
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
    // Scheduling fields are per-user now. These legacy RPC fields may not exist after migration.
  })) || []) as ExtendedWorkspaceTask[];

  // Enrich tasks with the *actual* workspace UUID (ws_id) via list -> board relation.
  // This is critical for personal workspace views where tasks may belong to other workspaces.
  const listIds = Array.from(
    new Set(tasksBase.map((t) => t.list_id).filter(Boolean))
  ) as string[];

  const wsIdByListId = new Map<string, string>();
  if (listIds.length > 0) {
    const { data: lists } = await supabase
      .from('task_lists')
      .select(
        `
        id,
        workspace_boards!inner (
          ws_id
        )
      `
      )
      .in('id', listIds);

    (lists as any[] | null)?.forEach((l) => {
      const resolvedTaskWsId = l?.workspace_boards?.ws_id;
      if (l?.id && resolvedTaskWsId) wsIdByListId.set(l.id, resolvedTaskWsId);
    });
  }

  const tasks = tasksBase.map((t) => ({
    ...t,
    ws_id:
      (t.list_id ? wsIdByListId.get(t.list_id) : undefined) ??
      // Fallback: if a task is list-less, treat it as current workspace-scoped.
      resolvedWsId,
  })) as ExtendedWorkspaceTask[];

  // Merge per-user scheduling settings so the calendar UI can still show duration/hour type.
  const taskIds = tasks.map((t) => t.id).filter(Boolean);
  const settingsByTaskId = new Map<
    string,
    {
      total_duration: number | null;
      is_splittable: boolean | null;
      min_split_duration_minutes: number | null;
      max_split_duration_minutes: number | null;
      calendar_hours: any;
      auto_schedule: boolean | null;
    }
  >();

  if (taskIds.length > 0) {
    const { data: schedulingRows } = await (supabase as any)
      .from('task_user_scheduling_settings')
      .select(
        `
        task_id,
        total_duration,
        is_splittable,
        min_split_duration_minutes,
        max_split_duration_minutes,
        calendar_hours,
        auto_schedule
      `
      )
      .eq('user_id', user.id)
      .in('task_id', taskIds);

    (schedulingRows as any[] | null)?.forEach((r) => {
      if (r?.task_id) settingsByTaskId.set(r.task_id, r);
    });
  }

  const tasksWithScheduling = tasks.map((t) => {
    const s = settingsByTaskId.get(t.id);
    return s
      ? ({
          ...t,
          total_duration: s.total_duration,
          is_splittable: s.is_splittable ?? false,
          min_split_duration_minutes: s.min_split_duration_minutes ?? null,
          max_split_duration_minutes: s.max_split_duration_minutes ?? null,
          calendar_hours: s.calendar_hours ?? null,
          auto_schedule: s.auto_schedule ?? false,
        } as ExtendedWorkspaceTask)
      : t;
  });

  // Personal workspace = workspace ID matches user ID (no need for auto-assignment)
  const isPersonalWorkspace = resolvedWsId === user.id;

  return (
    <CalendarSidebar
      // IMPORTANT: child components (task scheduler, schedule endpoints) expect a UUID.
      // Always pass the resolved workspace UUID, not the route slug (e.g. "personal").
      wsId={resolvedWsId}
      assigneeId={user.id}
      tasks={tasksWithScheduling}
      locale={locale}
      isPersonalWorkspace={isPersonalWorkspace}
    />
  );
}
