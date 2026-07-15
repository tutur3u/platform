import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  type BulkWorkspaceTaskOperation,
  type BulkWorkspaceTasksResponse,
  bulkWorkspaceTasks,
  getWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { calculateDaysUntilEndOfWeek } from '../../../../utils/weekDateUtils';

type BoardTaskCacheSnapshot = {
  previousTasks: Task[] | undefined;
  previousFullTasks: [QueryKey, Task[] | undefined][];
};

type CachedTaskWithWorkspace = Task & {
  source_workspace_id?: string | null;
  ws_id?: string | null;
  task_lists?: {
    workspace_boards?: {
      ws_id?: string | null;
    } | null;
  } | null;
};

type BulkWorkspaceTasksOptions = Parameters<typeof bulkWorkspaceTasks>[2];

export type BulkTaskWorkspaceGroup = {
  workspaceId: string;
  taskIds: string[];
};

function getTaskMutationWorkspaceId(
  task: CachedTaskWithWorkspace | undefined,
  defaultWorkspaceId: string
) {
  return (
    task?.source_workspace_id ??
    task?.ws_id ??
    task?.task_lists?.workspace_boards?.ws_id ??
    defaultWorkspaceId
  );
}

function getCachedBoardTasks(queryClient: QueryClient, boardId: string) {
  const tasks = queryClient.getQueryData<Task[]>(['tasks', boardId]) ?? [];
  const fullTaskEntries = queryClient.getQueriesData<Task[]>({
    queryKey: ['tasks-full', boardId],
  });
  const byId = new Map<string, CachedTaskWithWorkspace>();

  for (const task of tasks as CachedTaskWithWorkspace[]) {
    byId.set(task.id, task);
  }

  for (const [, fullTasks] of fullTaskEntries) {
    for (const task of (fullTasks ?? []) as CachedTaskWithWorkspace[]) {
      if (!byId.has(task.id)) {
        byId.set(task.id, task);
      }
    }
  }

  return byId;
}

export function getBulkTaskWorkspaceGroups({
  queryClient,
  boardId,
  defaultWorkspaceId,
  taskIds,
}: {
  queryClient: QueryClient;
  boardId: string;
  defaultWorkspaceId: string;
  taskIds: string[];
}) {
  const cachedTasksById = getCachedBoardTasks(queryClient, boardId);
  const groupsByWorkspaceId = new Map<string, string[]>();

  for (const taskId of taskIds) {
    const task = cachedTasksById.get(taskId);
    const workspaceId = getTaskMutationWorkspaceId(task, defaultWorkspaceId);
    const group = groupsByWorkspaceId.get(workspaceId) ?? [];
    group.push(taskId);
    groupsByWorkspaceId.set(workspaceId, group);
  }

  return Array.from(
    groupsByWorkspaceId,
    ([workspaceId, groupTaskIds]): BulkTaskWorkspaceGroup => ({
      workspaceId,
      taskIds: groupTaskIds,
    })
  );
}

export async function bulkWorkspaceTasksByEffectiveWorkspace({
  queryClient,
  boardId,
  defaultWorkspaceId,
  taskIds,
  operation,
  options,
  workspaceGroups,
}: {
  queryClient: QueryClient;
  boardId: string;
  defaultWorkspaceId: string;
  taskIds: string[];
  operation: BulkWorkspaceTaskOperation;
  options?: BulkWorkspaceTasksOptions;
  workspaceGroups?: BulkTaskWorkspaceGroup[];
}): Promise<BulkWorkspaceTasksResponse> {
  const groups =
    workspaceGroups ??
    getBulkTaskWorkspaceGroups({
      queryClient,
      boardId,
      defaultWorkspaceId,
      taskIds,
    });

  const aggregate: BulkWorkspaceTasksResponse = {
    successCount: 0,
    failCount: 0,
    taskIds,
    succeededTaskIds: [],
    failures: [],
    taskMetaById: {},
  };

  for (const group of groups) {
    try {
      const result = await bulkWorkspaceTasks(
        group.workspaceId,
        {
          taskIds: group.taskIds,
          operation,
        },
        options
      );

      aggregate.successCount += result.successCount;
      aggregate.failCount += result.failCount;
      aggregate.succeededTaskIds.push(...result.succeededTaskIds);
      aggregate.failures.push(...result.failures);

      if (result.taskMetaById) {
        aggregate.taskMetaById = {
          ...aggregate.taskMetaById,
          ...result.taskMetaById,
        };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Bulk task update failed';

      aggregate.failCount += group.taskIds.length;
      aggregate.failures.push(
        ...group.taskIds.map((taskId) => ({
          taskId,
          error: message,
        }))
      );
    }
  }

  return aggregate;
}

export function snapshotBoardTaskCaches(
  queryClient: QueryClient,
  boardId: string
): BoardTaskCacheSnapshot {
  return {
    previousTasks: queryClient.getQueryData<Task[]>(['tasks', boardId]),
    previousFullTasks: queryClient.getQueriesData<Task[]>({
      queryKey: ['tasks-full', boardId],
    }),
  };
}

export function restoreBoardTaskCaches(
  queryClient: QueryClient,
  boardId: string,
  snapshot: BoardTaskCacheSnapshot
) {
  queryClient.setQueryData(['tasks', boardId], snapshot.previousTasks);

  for (const [queryKey, tasks] of snapshot.previousFullTasks) {
    queryClient.setQueryData(queryKey, tasks);
  }
}

export function updateBoardTaskCaches(
  queryClient: QueryClient,
  boardId: string,
  updater: (old: Task[] | undefined) => Task[] | undefined
) {
  queryClient.setQueryData(['tasks', boardId], updater);
  queryClient.setQueriesData<Task[]>(
    { queryKey: ['tasks-full', boardId] },
    updater
  );
}

export function restoreFailedBoardTasks({
  queryClient,
  boardId,
  previousTasks,
  previousFullTasks,
  failedTaskIds,
}: {
  queryClient: QueryClient;
  boardId: string;
  previousTasks: Task[] | undefined;
  previousFullTasks?: [QueryKey, Task[] | undefined][];
  failedTaskIds: Iterable<string>;
}) {
  if (!Array.isArray(previousTasks) && !previousFullTasks?.length) {
    return;
  }

  const failedTaskIdSet = new Set(failedTaskIds);
  if (failedTaskIdSet.size === 0) {
    return;
  }

  const previousTaskMap = new Map<string, Task>();

  for (const [, tasks] of previousFullTasks ?? []) {
    for (const task of tasks ?? []) {
      previousTaskMap.set(task.id, task);
    }
  }

  for (const task of previousTasks ?? []) {
    previousTaskMap.set(task.id, task);
  }

  updateBoardTaskCaches(queryClient, boardId, (old) => {
    if (!old) return old;
    return old.map((task) => {
      if (!failedTaskIdSet.has(task.id)) return task;
      return previousTaskMap.get(task.id) ?? task;
    });
  });
}

export function restoreDeletedBoardTasks({
  queryClient,
  boardId,
  previousTasks,
  previousFullTasks,
  failedTaskIds,
}: {
  queryClient: QueryClient;
  boardId: string;
  previousTasks: Task[] | undefined;
  previousFullTasks?: [QueryKey, Task[] | undefined][];
  failedTaskIds: Iterable<string>;
}) {
  if (!Array.isArray(previousTasks) && !previousFullTasks?.length) {
    return;
  }

  const failedTaskIdSet = new Set(failedTaskIds);
  if (failedTaskIdSet.size === 0) {
    return;
  }

  const previousTaskMap = new Map<string, Task>();
  const previousOrder = new Map<string, number>();

  for (const [, tasks] of previousFullTasks ?? []) {
    for (const task of tasks ?? []) {
      if (!previousOrder.has(task.id)) {
        previousOrder.set(task.id, previousOrder.size);
      }
      previousTaskMap.set(task.id, task);
    }
  }

  for (const task of previousTasks ?? []) {
    if (!previousOrder.has(task.id)) {
      previousOrder.set(task.id, previousOrder.size);
    }
    previousTaskMap.set(task.id, task);
  }

  updateBoardTaskCaches(queryClient, boardId, (old) => {
    const existingById = new Map((old ?? []).map((task) => [task.id, task]));

    for (const failedTaskId of failedTaskIdSet) {
      const previousTask = previousTaskMap.get(failedTaskId);
      if (previousTask) {
        existingById.set(failedTaskId, previousTask);
      }
    }

    return Array.from(existingById.values()).sort((a, b) => {
      const aIndex = previousOrder.get(a.id);
      const bIndex = previousOrder.get(b.id);

      if (typeof aIndex === 'number' && typeof bIndex === 'number') {
        return aIndex - bIndex;
      }

      if (typeof aIndex === 'number') {
        return -1;
      }

      if (typeof bIndex === 'number') {
        return 1;
      }

      return 0;
    });
  });
}

export function getInternalApiOptions() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return { baseUrl: window.location.origin };
}

export async function getTaskForRelationMutation(
  queryClient: QueryClient,
  boardId: string,
  wsId: string,
  taskId: string
) {
  const cachedTasks = queryClient.getQueryData(['tasks', boardId]) as
    | Task[]
    | undefined;
  const cachedTask = cachedTasks?.find((task) => task.id === taskId);
  if (cachedTask) {
    return cachedTask;
  }

  try {
    const { task } = await getWorkspaceTask(
      wsId,
      taskId,
      getInternalApiOptions()
    );
    return task as Task;
  } catch {
    return null;
  }
}

export function resolveDueDatePreset(
  preset: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'clear',
  weekStartsOn: 0 | 1 | 6
) {
  if (preset === 'clear') {
    return null;
  }

  const d = new Date();

  if (preset === 'tomorrow') {
    d.setDate(d.getDate() + 1);
  } else if (preset === 'this_week') {
    d.setDate(d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn));
  } else if (preset === 'next_week') {
    d.setDate(d.getDate() + calculateDaysUntilEndOfWeek(weekStartsOn) + 7);
  }

  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
