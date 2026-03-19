import type { TaskWithScheduling } from '@tuturuuu/types';

type SchedulableTaskRow = {
  total_duration: number | null;
  is_splittable: boolean | null;
  min_split_duration_minutes: number | null;
  max_split_duration_minutes: number | null;
  calendar_hours: string | null;
  auto_schedule: boolean | null;
  tasks: any;
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
  isPersonalWorkspace,
  searchQuery,
}: FetchSchedulableTasksOptions): Promise<TaskWithScheduling[]> {
  let query = (sbAdmin as any)
    .from('task_user_scheduling_settings')
    .select(
      `
      total_duration,
      is_splittable,
      min_split_duration_minutes,
      max_split_duration_minutes,
      calendar_hours,
      auto_schedule,
      tasks!inner(
        *,
        task_lists!inner(
          workspace_boards!inner(ws_id)
        )
      )
    `
    )
    .eq('user_id', userId)
    .gt('total_duration', 0);

  if (!isPersonalWorkspace) {
    query = query.eq('tasks.task_lists.workspace_boards.ws_id', wsId);
  }

  if (searchQuery?.trim()) {
    query = query.ilike('tasks.name', `%${searchQuery.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const rows = (data as SchedulableTaskRow[] | null) ?? [];

  return rows
    .filter((row) => (row.auto_schedule ?? true) && row.tasks?.id)
    .map((row) => {
      const task = row.tasks;
      const resolvedTaskWsId =
        task?.task_lists?.workspace_boards?.ws_id ?? wsId;
      const { task_lists: _taskLists, ...taskWithoutLists } = task;

      return {
        ...taskWithoutLists,
        ws_id: resolvedTaskWsId,
        total_duration: row.total_duration ?? null,
        is_splittable: row.is_splittable ?? false,
        min_split_duration_minutes: row.min_split_duration_minutes ?? null,
        max_split_duration_minutes: row.max_split_duration_minutes ?? null,
        calendar_hours: row.calendar_hours ?? null,
        auto_schedule: row.auto_schedule ?? true,
      } as TaskWithScheduling;
    });
}
