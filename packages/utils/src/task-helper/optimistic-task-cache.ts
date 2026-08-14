import type { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';

export type OptimisticTask = Task & { _isOptimistic: true };

function updateOptimisticTaskCaches(
  queryClient: QueryClient,
  boardId: string,
  updater: (tasks: Task[] | undefined) => Task[] | undefined
) {
  queryClient.setQueryData<Task[]>(['tasks', boardId], updater);
  queryClient.setQueriesData<Task[]>(
    { queryKey: ['tasks-full', boardId] },
    updater
  );
}

export function createOptimisticTask(
  task: Partial<Task> & Pick<Task, 'list_id' | 'name'>,
  options: { id?: string; now?: Date } = {}
): OptimisticTask {
  const now = options.now ?? new Date();
  const id =
    options.id ??
    `optimistic-${
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${now.getTime()}-${Math.random().toString(36).slice(2)}`
    }`;

  return {
    ...task,
    _isOptimistic: true,
    assignees: task.assignees ?? [],
    created_at: task.created_at ?? now.toISOString(),
    id,
    labels: task.labels ?? [],
    projects: task.projects ?? [],
  } as OptimisticTask;
}

export function insertOptimisticTaskIntoBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  optimisticTask: Task
) {
  void queryClient.cancelQueries(
    { queryKey: ['tasks', boardId] },
    { revert: false }
  );
  void queryClient.cancelQueries(
    { queryKey: ['tasks-full', boardId] },
    { revert: false }
  );

  updateOptimisticTaskCaches(queryClient, boardId, (tasks) => {
    const currentTasks = tasks ?? [];
    if (currentTasks.some((task) => task.id === optimisticTask.id)) {
      return currentTasks;
    }
    return [...currentTasks, optimisticTask];
  });
}

export function reconcileOptimisticTaskInBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  optimisticTaskId: string,
  createdTask: Task
) {
  updateOptimisticTaskCaches(queryClient, boardId, (tasks) => {
    if (!tasks) return [createdTask];

    const optimisticIndex = tasks.findIndex(
      (task) => task.id === optimisticTaskId
    );
    const createdIndex = tasks.findIndex((task) => task.id === createdTask.id);
    const insertionIndex =
      optimisticIndex >= 0
        ? optimisticIndex
        : createdIndex >= 0
          ? createdIndex
          : tasks.length;
    const nextTasks = tasks.filter(
      (task) => task.id !== optimisticTaskId && task.id !== createdTask.id
    );

    nextTasks.splice(
      Math.min(insertionIndex, nextTasks.length),
      0,
      createdTask
    );
    return nextTasks;
  });
}

export function removeOptimisticTaskFromBoardCaches(
  queryClient: QueryClient,
  boardId: string,
  optimisticTaskId: string
) {
  updateOptimisticTaskCaches(queryClient, boardId, (tasks) =>
    tasks?.filter((task) => task.id !== optimisticTaskId)
  );
}
