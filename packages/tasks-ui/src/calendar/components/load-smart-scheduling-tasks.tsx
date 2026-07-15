import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';

interface LoadSmartSchedulingTasksOptions {
  resolvedWsId: string;
  userId: string;
}

interface AccessibleTaskRow {
  task_id: string;
  task_name: string | null;
  task_description: string | null;
  task_creator_id: string | null;
  task_list_id: string | null;
  task_start_date: string | null;
  task_end_date: string | null;
  task_priority: ExtendedWorkspaceTask['priority'];
  task_completed_at: string | null;
  task_closed_at: string | null;
  task_deleted_at: string | null;
  task_estimation_points: number | null;
  task_created_at: string | null;
}

interface TaskListWorkspaceRow {
  id?: string | null;
  workspace_boards?: {
    ws_id?: string | null;
  } | null;
}

interface TaskSchedulingRow {
  task_id?: string | null;
  total_duration: number | null;
  is_splittable: boolean | null;
  min_split_duration_minutes: number | null;
  max_split_duration_minutes: number | null;
  calendar_hours: ExtendedWorkspaceTask['calendar_hours'];
  auto_schedule: boolean | null;
}

export async function loadSmartSchedulingTasks({
  resolvedWsId,
  userId,
}: LoadSmartSchedulingTasksOptions): Promise<ExtendedWorkspaceTask[]> {
  const supabase = await createAdminClient({ noCookie: true });
  const { data: rpcTasks } = await supabase.rpc('get_user_accessible_tasks', {
    p_user_id: userId,
    p_ws_id: resolvedWsId,
    p_include_deleted: false,
    p_list_statuses: ['not_started', 'active'],
  });

  const tasksBase = ((rpcTasks ?? []) as AccessibleTaskRow[]).map((task) => ({
    id: task.task_id,
    name: task.task_name,
    description: task.task_description,
    creator_id: task.task_creator_id,
    list_id: task.task_list_id,
    start_date: task.task_start_date,
    end_date: task.task_end_date,
    due_date: task.task_end_date,
    priority: task.task_priority,
    completed_at: task.task_completed_at,
    closed_at: task.task_closed_at,
    deleted_at: task.task_deleted_at,
    estimation_points: task.task_estimation_points,
    created_at: task.task_created_at,
  })) as ExtendedWorkspaceTask[];

  const listIds = Array.from(
    new Set(tasksBase.map((task) => task.list_id).filter(Boolean))
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

    (lists as TaskListWorkspaceRow[] | null)?.forEach((list) => {
      const taskWsId = list.workspace_boards?.ws_id;
      if (list.id && taskWsId) wsIdByListId.set(list.id, taskWsId);
    });
  }

  const tasks = tasksBase.map((task) => ({
    ...task,
    ws_id:
      (task.list_id ? wsIdByListId.get(task.list_id) : undefined) ??
      resolvedWsId,
  })) as ExtendedWorkspaceTask[];

  const taskIds = tasks.map((task) => task.id).filter(Boolean);
  const settingsByTaskId = new Map<string, TaskSchedulingRow>();

  if (taskIds.length > 0) {
    const { data: schedulingRows } = await supabase
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
      .eq('user_id', userId)
      .in('task_id', taskIds);

    (schedulingRows as TaskSchedulingRow[] | null)?.forEach((row) => {
      if (row.task_id) settingsByTaskId.set(row.task_id, row);
    });
  }

  return tasks.map((task) => {
    const settings = settingsByTaskId.get(task.id);
    return settings
      ? ({
          ...task,
          total_duration: settings.total_duration,
          is_splittable: settings.is_splittable ?? false,
          min_split_duration_minutes:
            settings.min_split_duration_minutes ?? null,
          max_split_duration_minutes:
            settings.max_split_duration_minutes ?? null,
          calendar_hours: settings.calendar_hours ?? null,
          auto_schedule: settings.auto_schedule ?? false,
        } as ExtendedWorkspaceTask)
      : task;
  });
}
