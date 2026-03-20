import type { QueryClient } from '@tanstack/react-query';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  createWorkspaceTask,
  getWorkspaceTask,
  listWorkspaceBoardsWithLists,
  moveWorkspaceTask,
  triggerWorkspaceTaskEmbedding,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';

import {
  getBrowserApiOptions,
  getMutationApiOptions,
  toWorkspaceTaskUpdatePayload,
} from './shared';

export async function getTaskAssignees(wsId: string, taskId: string) {
  const { task } = await getWorkspaceTask(wsId, taskId, getBrowserApiOptions());
  return task.assignees ?? [];
}

export async function createTask(
  wsId: string,
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

  if (!wsId) {
    throw new Error('Workspace ID is required');
  }

  const schedulingInput = task as Partial<{
    total_duration: number | null;
    is_splittable: boolean | null;
    min_split_duration_minutes: number | null;
    max_split_duration_minutes: number | null;
    calendar_hours: Task['calendar_hours'];
    auto_schedule: boolean | null;
  }>;

  const options = await getMutationApiOptions();
  const { task: createdTask } = await createWorkspaceTask(
    wsId,
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
    triggerWorkspaceTaskEmbedding(
      wsId,
      createdTask.id,
      getBrowserApiOptions()
    ).catch((err) => {
      console.error('Failed to generate embedding:', err);
    });
  }

  return createdTask as Task;
}

export async function updateTask(
  wsId: string,
  taskId: string,
  task: Partial<Task> & { completed?: boolean }
) {
  if (!wsId) {
    throw new Error('Workspace ID is required');
  }

  const options = await getMutationApiOptions();
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
    triggerWorkspaceTaskEmbedding(wsId, taskId, getBrowserApiOptions()).catch(
      (err) => {
        console.error('Failed to regenerate embedding:', err);
      }
    );
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
  wsId: string,
  taskId: string,
  listId: string
) {
  const options = getBrowserApiOptions();
  const [{ boards }, { task }] = await Promise.all([
    listWorkspaceBoardsWithLists(wsId, options),
    getWorkspaceTask(wsId, taskId, options),
  ]);

  const list = boards
    .flatMap((board) => board.task_lists)
    .find((entry) => entry.id === listId);

  if (!list) {
    console.error('Error fetching list status: list not found', { listId });
    return;
  }

  const shouldArchive = list.status === 'done' || list.status === 'closed';

  if (!!task.closed_at !== shouldArchive) {
    try {
      const mutationOptions = await getMutationApiOptions();
      await updateWorkspaceTask(
        wsId,
        taskId,
        { closed_at: shouldArchive ? new Date().toISOString() : null },
        mutationOptions
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
  wsId: string,
  taskId: string,
  newListId: string,
  targetBoardId?: string
) {
  if (!wsId) {
    throw new Error('Workspace ID is required');
  }

  const options = await getMutationApiOptions();
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
