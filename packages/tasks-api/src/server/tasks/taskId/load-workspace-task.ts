import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskRecord } from './schema';

export async function getWorkspaceTask(
  supabase: TypedSupabaseClient,
  wsId: string,
  taskId: string
): Promise<{ error: Error | null; task: TaskRecord | null }> {
  const { data: task, error } = await supabase
    .from('tasks')
    .select(
      `
      id,
      display_number,
      name,
      description,
      priority,
      completed,
      completed_at,
      start_date,
      end_date,
      estimation_points,
      sort_key,
      created_at,
      closed_at,
      deleted_at,
      list_id,
      task_lists!inner (
        id,
        name,
        status,
        board_id,
        workspace_boards!inner (
          id,
          ws_id,
          name,
          workspace:workspaces (
            personal
          )
        )
      ),
      assignees:task_assignees(
        ...users(
          id,
          display_name,
          avatar_url
        )
      ),
      labels:task_labels(
        ...workspace_task_labels(
          id,
          name,
          color,
          created_at
        )
      ),
      projects:task_project_tasks(
        ticket_number,
        created_at,
        ...task_projects(
          ticket_key,
          id,
          name,
          status
        )
      )
    `
    )
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    return { error, task: null };
  }

  if (!task || task.task_lists?.workspace_boards?.ws_id !== wsId) {
    return { error: null, task: null };
  }

  return { error: null, task: task as TaskRecord };
}
