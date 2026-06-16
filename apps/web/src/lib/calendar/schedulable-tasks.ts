import type { TaskWithScheduling } from '@tuturuuu/types';

type RpcTaskRow = {
  task_id: string;
  task_name: string | null;
  sched_total_duration: number | null;
  sched_is_splittable: boolean | null;
  sched_min_split_duration_minutes: number | null;
  sched_max_split_duration_minutes: number | null;
  sched_calendar_hours: string | null;
  sched_auto_schedule: boolean | null;
};

type TaskRowWithWorkspace = Record<string, unknown> & {
  id: string;
  task_lists?: {
    workspace_boards?: {
      ws_id?: string | null;
    } | null;
  } | null;
};

type FetchSchedulableTasksOptions = {
  sbAdmin: any;
  wsId: string;
  userId: string;
  isPersonalWorkspace: boolean;
  searchQuery?: string;
};

export async function fetchSchedulableTasksForWorkspace({
  sbAdmin,
  wsId,
  userId,
  searchQuery,
}: FetchSchedulableTasksOptions): Promise<TaskWithScheduling[]> {
  const { data: accessibleRows, error: accessibleRowsError } =
    await sbAdmin.rpc('get_user_tasks_with_relations', {
      p_exclude_personally_completed: false,
      p_exclude_personally_unassigned: false,
      p_filter_board_ids: undefined,
      p_filter_label_ids: undefined,
      p_filter_project_ids: undefined,
      p_filter_self_managed_only: false,
      p_filter_ws_ids: undefined,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active', 'review', 'done'],
      p_user_id: userId,
      p_ws_id: wsId,
    });

  if (accessibleRowsError) {
    throw accessibleRowsError;
  }

  const normalizedSearchQuery = searchQuery?.trim().toLowerCase();
  const schedulableRows = ((accessibleRows as RpcTaskRow[] | null) ?? [])
    .filter(
      (row) =>
        (row.sched_auto_schedule ?? true) && (row.sched_total_duration ?? 0) > 0
    )
    .filter((row) =>
      normalizedSearchQuery
        ? (row.task_name ?? '').toLowerCase().includes(normalizedSearchQuery)
        : true
    );

  if (schedulableRows.length === 0) {
    return [];
  }

  const schedulingByTaskId = new Map(
    schedulableRows.map((row) => [row.task_id, row] as const)
  );
  const taskIds = schedulableRows.map((row) => row.task_id);

  const { data, error } = await (sbAdmin as any)
    .from('tasks')
    .select(
      `
      *,
      task_lists!inner(
        workspace_boards!inner(ws_id)
      )
    `
    )
    .in('id', taskIds);

  if (error) {
    throw error;
  }

  const taskById = new Map(
    ((data as TaskRowWithWorkspace[] | null) ?? []).map((task) => [
      task.id,
      task,
    ])
  );

  return taskIds
    .map((taskId) => {
      const task = taskById.get(taskId);
      const scheduling = schedulingByTaskId.get(taskId);
      if (!task || !scheduling) {
        return null;
      }

      const resolvedTaskWsId =
        task?.task_lists?.workspace_boards?.ws_id ?? wsId;
      const { task_lists: _taskLists, ...taskWithoutLists } = task;

      return {
        ...taskWithoutLists,
        ws_id: resolvedTaskWsId,
        total_duration: scheduling.sched_total_duration ?? null,
        is_splittable: scheduling.sched_is_splittable ?? false,
        min_split_duration_minutes:
          scheduling.sched_min_split_duration_minutes ?? null,
        max_split_duration_minutes:
          scheduling.sched_max_split_duration_minutes ?? null,
        calendar_hours: scheduling.sched_calendar_hours ?? null,
        auto_schedule: scheduling.sched_auto_schedule ?? true,
      } as TaskWithScheduling;
    })
    .filter((task): task is TaskWithScheduling => Boolean(task));
}
