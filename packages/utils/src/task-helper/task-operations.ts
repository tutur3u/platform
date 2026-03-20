import type { QueryClient } from '@tanstack/react-query';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  createWorkspaceTask,
  moveWorkspaceTask,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Task, TaskAssignee } from '@tuturuuu/types/primitives/Task';

import {
  getMutationApiOptions,
  resolveListContext,
  resolveTaskContext,
  toWorkspaceTaskUpdatePayload,
} from './shared';

export async function getTaskAssignees(
  supabase: TypedSupabaseClient,
  taskId: string
) {
  const { data, error } = await supabase
    .from('task_assignees')
    .select('*')
    .eq('task_id', taskId);

  if (error) throw error;
  return data as TaskAssignee[];
}

export async function createTask(
  supabase: TypedSupabaseClient,
  listId: string,
  task: Partial<Task> & {
    description_yjs_state?: number[];
    label_ids?: string[];
    assignee_ids?: string[];
    project_ids?: string[];
  }
) {
  if (!task.name || task.name.trim().length === 0) {
    throw new Error('Task name is required');
  }

  if (!listId) {
    throw new Error('List ID is required');
  }

  const {
    data: { user: currentUser },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !currentUser) {
    console.error('Authentication error:', authError);
    throw new Error('User not authenticated');
  }

  const { data: listCheck, error: listError } = await supabase
    .from('task_lists')
    .select('id, name')
    .eq('id', listId)
    .single();

  if (listError) {
    throw new Error(
      `List not found or access denied: ${listError.message || 'Unknown error'}`
    );
  }

  if (!listCheck) {
    throw new Error('List not found');
  }

  const listContext = await resolveListContext(supabase, listId);
  const schedulingInput = task as Partial<{
    total_duration: number | null;
    is_splittable: boolean | null;
    min_split_duration_minutes: number | null;
    max_split_duration_minutes: number | null;
    calendar_hours: Task['calendar_hours'];
    auto_schedule: boolean | null;
  }>;

  const options = await getMutationApiOptions(supabase);
  const { task: createdTask } = await createWorkspaceTask(
    listContext.wsId,
    {
      name: task.name.trim(),
      description: task.description || null,
      description_yjs_state: task.description_yjs_state ?? null,
      listId,
      priority: task.priority || null,
      start_date: task.start_date || null,
      end_date: task.end_date || null,
      estimation_points: task.estimation_points ?? null,
      label_ids: task.label_ids ?? [],
      assignee_ids: task.assignee_ids ?? [],
      project_ids: task.project_ids ?? [],
      total_duration: schedulingInput.total_duration ?? null,
      is_splittable: schedulingInput.is_splittable ?? null,
      min_split_duration_minutes:
        schedulingInput.min_split_duration_minutes ?? null,
      max_split_duration_minutes:
        schedulingInput.max_split_duration_minutes ?? null,
      calendar_hours: schedulingInput.calendar_hours ?? null,
      auto_schedule: schedulingInput.auto_schedule ?? null,
    },
    options
  );

  if (typeof window !== 'undefined' && createdTask) {
    const pathParts = window.location.pathname.split('/');
    const wsId = pathParts[2];

    if (wsId) {
      fetch(`/api/v1/workspaces/${wsId}/tasks/${createdTask.id}/embedding`, {
        method: 'POST',
      }).catch((err) => {
        console.error('Failed to generate embedding:', err);
      });
    }
  }

  return createdTask as Task;
}

export async function updateTask(
  supabase: TypedSupabaseClient,
  taskId: string,
  task: Partial<Task> & { completed?: boolean }
) {
  const { wsId } = await resolveTaskContext(supabase, taskId);
  const options = await getMutationApiOptions(supabase);
  const { task: data } = await updateWorkspaceTask(
    wsId,
    taskId,
    toWorkspaceTaskUpdatePayload(task),
    options
  );

  if (
    (task.name !== undefined || task.description !== undefined) &&
    typeof window !== 'undefined' &&
    data
  ) {
    const pathParts = window.location.pathname.split('/');
    const wsId = pathParts[1];

    if (wsId) {
      fetch(`/api/v1/workspaces/${wsId}/tasks/${taskId}/embedding`, {
        method: 'POST',
      }).catch((err) => {
        console.error('Failed to regenerate embedding:', err);
      });
    }
  }

  return data as Task;
}

export async function invalidateTaskCaches(
  queryClient: QueryClient,
  boardId?: string
) {
  const promises: Promise<void>[] = [];

  if (boardId) {
    promises.push(
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] })
    );
    promises.push(
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] })
    );
  }

  promises.push(
    queryClient.invalidateQueries({ queryKey: ['time-tracking-data'] })
  );

  await Promise.all(promises);
}

export async function syncTaskArchivedStatus(
  supabase: TypedSupabaseClient,
  taskId: string,
  listId: string
) {
  const { data: list, error: listError } = await supabase
    .from('task_lists')
    .select('status')
    .eq('id', listId)
    .single();

  if (listError) {
    console.error('Error fetching list status:', listError);
    return;
  }

  const shouldArchive = list.status === 'done' || list.status === 'closed';

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('closed_at')
    .eq('id', taskId)
    .single();

  if (taskError) {
    console.error('Error fetching task status:', taskError);
    return;
  }

  if (!!task.closed_at !== shouldArchive) {
    try {
      const { wsId } = await resolveTaskContext(supabase, taskId);
      const options = await getMutationApiOptions(supabase);
      await updateWorkspaceTask(
        wsId,
        taskId,
        { closed_at: shouldArchive ? new Date().toISOString() : null },
        options
      );
    } catch (updateError) {
      console.error('Error syncing task archived status:', updateError);
    }
  }
}

export async function moveTask(
  wsId: string,
  taskId: string,
  newListId: string,
  options?: InternalApiClientOptions
) {
  const { task } = await updateWorkspaceTask(
    wsId,
    taskId,
    {
      list_id: newListId,
    },
    options
  );

  return task as Task;
}

export async function moveTaskToBoard(
  supabase: TypedSupabaseClient,
  taskId: string,
  newListId: string,
  targetBoardId?: string
) {
  const { wsId } = await resolveTaskContext(supabase, taskId);
  const options = await getMutationApiOptions(supabase);
  const result = await moveWorkspaceTask(
    wsId,
    taskId,
    {
      list_id: newListId,
      target_board_id: targetBoardId,
    },
    options
  );

  return {
    ...result,
    task: result.task as Task,
  };
}
