'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  isPersonalExternalTask,
  moveExternalTaskToPersonalList,
} from '@tuturuuu/ui/hooks/task-actions-personal-external';
import {
  isTaskBoardResolvedStatus,
  isTaskBoardTerminalStatus,
} from '@tuturuuu/utils/task-list-status';

function markBulkTaskLocallyMutated(task: Task): Task {
  return {
    ...(task as Task & { _localMutationAt?: number }),
    _localMutationAt: Date.now(),
  } as Task;
}

function getSelectedTaskSnapshots({
  boardId,
  queryClient,
  taskIds,
}: {
  boardId: string;
  queryClient: QueryClient;
  taskIds: string[];
}) {
  const taskIdSet = new Set(taskIds);
  const currentTasks =
    queryClient.getQueryData<Task[]>(['tasks', boardId]) ?? [];

  return currentTasks.filter((task) => taskIdSet.has(task.id));
}

export function getExternalTaskIdSet(tasks: Task[]) {
  return new Set(
    tasks.filter((task) => isPersonalExternalTask(task)).map((task) => task.id)
  );
}

export function getMovePartitions({
  boardId,
  queryClient,
  taskIds,
}: {
  boardId: string;
  queryClient: QueryClient;
  taskIds: string[];
}) {
  const selectedTasks = getSelectedTaskSnapshots({
    boardId,
    queryClient,
    taskIds,
  });
  const externalTasks = selectedTasks.filter((task) =>
    isPersonalExternalTask(task)
  );
  const externalTaskIds = new Set(externalTasks.map((task) => task.id));

  return {
    externalTasks,
    localTaskIds: taskIds.filter((taskId) => !externalTaskIds.has(taskId)),
  };
}

function getCachedTask(
  queryClient: QueryClient,
  boardId: string,
  taskId: string
) {
  const currentTasks =
    queryClient.getQueryData<Task[]>(['tasks', boardId]) ?? [];
  return currentTasks.find((task) => task.id === taskId) ?? null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Failed to move task';
}

export async function moveExternalTasksToPersonalList({
  boardId,
  queryClient,
  targetList,
  tasks,
}: {
  boardId: string;
  queryClient: QueryClient;
  targetList: TaskList;
  tasks: Task[];
}) {
  const movedTaskIds: string[] = [];
  const failures: Array<{ taskId: string; error: string }> = [];
  const taskTimestamps = new Map<
    string,
    { completed_at: string | null; closed_at: string | null }
  >();
  const placementPosition = isTaskBoardResolvedStatus(targetList.status)
    ? 'top'
    : 'end';
  const sourceStatus = isTaskBoardTerminalStatus(targetList.status)
    ? targetList.status
    : undefined;

  for (const task of tasks) {
    try {
      const { sourceTask } = await moveExternalTaskToPersonalList({
        boardId,
        markLocallyMutatedTask: markBulkTaskLocallyMutated,
        queryClient,
        task,
        targetList,
        placementPosition,
        sourceStatus,
      });
      const cachedTask = getCachedTask(queryClient, boardId, task.id);

      movedTaskIds.push(task.id);
      taskTimestamps.set(task.id, {
        completed_at:
          cachedTask?.completed_at ?? sourceTask?.completed_at ?? null,
        closed_at: cachedTask?.closed_at ?? sourceTask?.closed_at ?? null,
      });
    } catch (error) {
      failures.push({ taskId: task.id, error: errorMessage(error) });
    }
  }

  return { movedTaskIds, failures, taskTimestamps };
}
