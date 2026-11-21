import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  isMissingTaskFleetColumn,
  serializeTaskFleetFields,
  taskFleetClient,
  withTaskFleetColumns,
} from '../task-fleet-fields';
import type { TaskRecord } from './schema';

export async function getWorkspaceTask(
  supabase: TypedSupabaseClient,
  wsId: string,
  taskId: string
): Promise<{ error: Error | null; task: TaskRecord | null }> {
  const query = (includeFleetFields: boolean) =>
    taskFleetClient(supabase)
      .from('tasks')
      .select(
        withTaskFleetColumns(
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
          ticket_prefix,
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
    `,
          includeFleetFields
        )
      )
      .eq('id', taskId)
      .maybeSingle();

  let result = await query(true);
  if (result.error && isMissingTaskFleetColumn(result.error)) {
    result = await query(false);
  }
  const { data: task, error } = result;

  if (error) {
    return { error, task: null };
  }

  if (!task || task.task_lists?.workspace_boards?.ws_id !== wsId) {
    return { error: null, task: null };
  }

  return { error: null, task: task as TaskRecord };
}

export function serializeTask(task: TaskRecord) {
  const assigneeIds = Array.isArray(task.assignees)
    ? task.assignees
        .map((entry) => entry?.id)
        .filter((id): id is string => !!id)
    : [];

  const labelIds = Array.isArray(task.labels)
    ? task.labels.map((entry) => entry?.id).filter((id): id is string => !!id)
    : [];

  const projectIds = Array.isArray(task.projects)
    ? task.projects.map((entry) => entry?.id).filter((id): id is string => !!id)
    : [];

  const uniqueAssigneeIds = [...new Set(assigneeIds)];
  const uniqueLabelIds = [...new Set(labelIds)];
  const uniqueProjectIds = [...new Set(projectIds)];

  return {
    ...serializeTaskFleetFields(task),
    id: task.id,
    display_number: task.display_number,
    name: task.name,
    description: task.description,
    priority: task.priority,
    completed: task.completed,
    completed_at: task.completed_at,
    start_date: task.start_date,
    end_date: task.end_date,
    estimation_points: task.estimation_points,
    sort_key: task.sort_key,
    created_at: task.created_at,
    closed_at: task.closed_at,
    deleted_at: task.deleted_at,
    list_id: task.list_id,
    board_id: task.task_lists?.board_id ?? null,
    ticket_prefix: task.task_lists?.workspace_boards?.ticket_prefix ?? null,
    board_name: task.task_lists?.workspace_boards?.name ?? null,
    list_name: task.task_lists?.name ?? null,
    list_status: task.task_lists?.status ?? null,
    assignees: task.assignees ?? [],
    labels: task.labels ?? [],
    projects: task.projects ?? [],
    assignee_ids: uniqueAssigneeIds,
    label_ids: uniqueLabelIds,
    project_ids: uniqueProjectIds,
    is_personal_external: false,
    is_personal_external_default: false,
  };
}
