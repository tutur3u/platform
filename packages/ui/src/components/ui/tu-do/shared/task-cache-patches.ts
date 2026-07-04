import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';

type WorkspaceTaskCache = {
  task?: Task | null;
};

type MyTasksCache = {
  overdue?: Task[];
  today?: Task[];
  upcoming?: Task[];
  completed?: Task[];
};

type MyCompletedTasksCache = {
  pages?: Array<{
    completed?: Task[];
  }>;
};

export type VisibleTaskCacheSnapshot = {
  boardTaskEntries: [QueryKey, Task[] | undefined][];
  taskEntries: [QueryKey, Task | undefined][];
  workspaceTaskEntries: [QueryKey, WorkspaceTaskCache | undefined][];
  myTasksEntries: [QueryKey, MyTasksCache | undefined][];
  myCompletedTaskEntries: [QueryKey, MyCompletedTasksCache | undefined][];
};

function isBoardTaskQuery(queryKey: QueryKey, boardId: string) {
  return (
    Array.isArray(queryKey) &&
    (queryKey[0] === 'tasks' || queryKey[0] === 'tasks-full') &&
    queryKey[1] === boardId
  );
}

function isTaskDetailQuery(queryKey: QueryKey, taskIds: Set<string>) {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === 'task' &&
    typeof queryKey[1] === 'string' &&
    taskIds.has(queryKey[1])
  );
}

function isWorkspaceTaskQuery(queryKey: QueryKey, taskIds: Set<string>) {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === 'workspaceTask' &&
    typeof queryKey[2] === 'string' &&
    taskIds.has(queryKey[2])
  );
}

function patchTaskArray<T extends { id?: string }>(
  tasks: T[] | undefined,
  taskIds: Set<string>,
  updater: (task: Task) => Task
): T[] | undefined {
  if (!tasks) return tasks;

  let changed = false;
  const nextTasks = tasks.map((task) => {
    if (!task.id || !taskIds.has(task.id)) {
      return task;
    }

    const updatedTask = updater(task as unknown as Task) as unknown as T;
    if (updatedTask !== task) {
      changed = true;
    }

    return updatedTask;
  });

  return changed ? nextTasks : tasks;
}

function restoreTaskArrayFromSnapshot<T extends { id?: string }>(
  currentTasks: T[] | undefined,
  previousTasks: T[] | undefined,
  taskIds: Set<string>
): T[] | undefined {
  if (!currentTasks || !previousTasks) return currentTasks;

  const previousById = new Map(
    previousTasks
      .filter((task) => task.id && taskIds.has(task.id))
      .map((task) => [task.id, task])
  );
  if (previousById.size === 0) return currentTasks;

  let changed = false;
  const restoredTasks = currentTasks.map((task) => {
    if (!task.id) return task;
    const previousTask = previousById.get(task.id);
    if (!previousTask) return task;

    changed = true;
    return previousTask;
  });

  return changed ? restoredTasks : currentTasks;
}

function patchMyTasksCache(
  cache: MyTasksCache | undefined,
  taskIds: Set<string>,
  updater: (task: Task) => Task
) {
  if (!cache) return cache;

  return {
    ...cache,
    overdue: patchTaskArray(cache.overdue, taskIds, updater) ?? cache.overdue,
    today: patchTaskArray(cache.today, taskIds, updater) ?? cache.today,
    upcoming:
      patchTaskArray(cache.upcoming, taskIds, updater) ?? cache.upcoming,
    completed:
      patchTaskArray(cache.completed, taskIds, updater) ?? cache.completed,
  };
}

function patchMyCompletedTasksCache(
  cache: MyCompletedTasksCache | undefined,
  taskIds: Set<string>,
  updater: (task: Task) => Task
) {
  if (!cache?.pages) return cache;

  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      completed:
        patchTaskArray(page.completed, taskIds, updater) ?? page.completed,
    })),
  };
}

function restoreMyTasksCacheFromSnapshot(
  current: MyTasksCache | undefined,
  previous: MyTasksCache | undefined,
  taskIds: Set<string>
) {
  if (!current || !previous) return current;

  return {
    ...current,
    overdue:
      restoreTaskArrayFromSnapshot(
        current.overdue,
        previous.overdue,
        taskIds
      ) ?? current.overdue,
    today:
      restoreTaskArrayFromSnapshot(current.today, previous.today, taskIds) ??
      current.today,
    upcoming:
      restoreTaskArrayFromSnapshot(
        current.upcoming,
        previous.upcoming,
        taskIds
      ) ?? current.upcoming,
    completed:
      restoreTaskArrayFromSnapshot(
        current.completed,
        previous.completed,
        taskIds
      ) ?? current.completed,
  };
}

function restoreMyCompletedTasksCacheFromSnapshot(
  current: MyCompletedTasksCache | undefined,
  previous: MyCompletedTasksCache | undefined,
  taskIds: Set<string>
) {
  if (!current?.pages || !previous?.pages) return current;

  return {
    ...current,
    pages: current.pages.map((page, index) => ({
      ...page,
      completed:
        restoreTaskArrayFromSnapshot(
          page.completed,
          previous.pages?.[index]?.completed,
          taskIds
        ) ?? page.completed,
    })),
  };
}

export function getTaskFromVisibleCaches({
  queryClient,
  boardId,
  taskId,
  fallback,
}: {
  queryClient: QueryClient;
  boardId: string;
  taskId: string;
  fallback?: Task;
}): Task | undefined {
  const taskDetail = queryClient.getQueryData<Task>(['task', taskId]);
  if (taskDetail) return taskDetail;

  const workspaceTaskEntries = queryClient.getQueriesData<WorkspaceTaskCache>({
    predicate: (query) =>
      isWorkspaceTaskQuery(query.queryKey, new Set([taskId])),
  });
  for (const [, entry] of workspaceTaskEntries) {
    if (entry?.task) return entry.task;
  }

  const boardTaskEntries = queryClient.getQueriesData<Task[]>({
    predicate: (query) => isBoardTaskQuery(query.queryKey, boardId),
  });
  for (const [, tasks] of boardTaskEntries) {
    const task = tasks?.find((entry) => entry.id === taskId);
    if (task) return task;
  }

  return fallback;
}

export function patchTasksInVisibleCaches({
  queryClient,
  boardId,
  taskIds,
  updater,
}: {
  queryClient: QueryClient;
  boardId: string;
  taskIds: string[];
  updater: (task: Task) => Task;
}) {
  const taskIdSet = new Set(taskIds);
  if (taskIdSet.size === 0) return;

  queryClient.setQueriesData<Task[]>(
    {
      predicate: (query) => isBoardTaskQuery(query.queryKey, boardId),
    },
    (old) => patchTaskArray(old, taskIdSet, updater)
  );

  queryClient.setQueriesData<Task>(
    {
      predicate: (query) => isTaskDetailQuery(query.queryKey, taskIdSet),
    },
    (old) => (old ? updater(old) : old)
  );

  queryClient.setQueriesData<WorkspaceTaskCache>(
    {
      predicate: (query) => isWorkspaceTaskQuery(query.queryKey, taskIdSet),
    },
    (old) =>
      old?.task
        ? {
            ...old,
            task: updater(old.task),
          }
        : old
  );

  queryClient.setQueriesData<MyTasksCache>({ queryKey: ['my-tasks'] }, (old) =>
    patchMyTasksCache(old, taskIdSet, updater)
  );

  queryClient.setQueriesData<MyCompletedTasksCache>(
    { queryKey: ['my-completed-tasks'] },
    (old) => patchMyCompletedTasksCache(old, taskIdSet, updater)
  );
}

export function patchTaskInVisibleCaches({
  queryClient,
  boardId,
  taskId,
  updater,
}: {
  queryClient: QueryClient;
  boardId: string;
  taskId: string;
  updater: (task: Task) => Task;
}) {
  patchTasksInVisibleCaches({
    queryClient,
    boardId,
    taskIds: [taskId],
    updater,
  });
}

export function snapshotVisibleTaskCaches(
  queryClient: QueryClient,
  boardId: string,
  taskIds: string[]
): VisibleTaskCacheSnapshot {
  const taskIdSet = new Set(taskIds);

  return {
    boardTaskEntries: queryClient.getQueriesData<Task[]>({
      predicate: (query) => isBoardTaskQuery(query.queryKey, boardId),
    }),
    taskEntries: queryClient.getQueriesData<Task>({
      predicate: (query) => isTaskDetailQuery(query.queryKey, taskIdSet),
    }),
    workspaceTaskEntries: queryClient.getQueriesData<WorkspaceTaskCache>({
      predicate: (query) => isWorkspaceTaskQuery(query.queryKey, taskIdSet),
    }),
    myTasksEntries: queryClient.getQueriesData<MyTasksCache>({
      queryKey: ['my-tasks'],
    }),
    myCompletedTaskEntries: queryClient.getQueriesData<MyCompletedTasksCache>({
      queryKey: ['my-completed-tasks'],
    }),
  };
}

export function restoreVisibleTaskCaches(
  queryClient: QueryClient,
  snapshot: VisibleTaskCacheSnapshot
) {
  for (const [queryKey, data] of snapshot.boardTaskEntries) {
    queryClient.setQueryData(queryKey, data);
  }

  for (const [queryKey, data] of snapshot.taskEntries) {
    queryClient.setQueryData(queryKey, data);
  }

  for (const [queryKey, data] of snapshot.workspaceTaskEntries) {
    queryClient.setQueryData(queryKey, data);
  }

  for (const [queryKey, data] of snapshot.myTasksEntries) {
    queryClient.setQueryData(queryKey, data);
  }

  for (const [queryKey, data] of snapshot.myCompletedTaskEntries) {
    queryClient.setQueryData(queryKey, data);
  }
}

export function restoreTasksFromVisibleCacheSnapshot({
  queryClient,
  snapshot,
  taskIds,
}: {
  queryClient: QueryClient;
  snapshot: VisibleTaskCacheSnapshot;
  taskIds: string[];
}) {
  const taskIdSet = new Set(taskIds);
  if (taskIdSet.size === 0) return;

  for (const [queryKey, previousTasks] of snapshot.boardTaskEntries) {
    queryClient.setQueryData<Task[]>(queryKey, (currentTasks) =>
      restoreTaskArrayFromSnapshot(currentTasks, previousTasks, taskIdSet)
    );
  }

  for (const [queryKey, previousTask] of snapshot.taskEntries) {
    if (!Array.isArray(queryKey) || typeof queryKey[1] !== 'string') continue;
    if (!taskIdSet.has(queryKey[1])) continue;
    queryClient.setQueryData(queryKey, previousTask);
  }

  for (const [queryKey, previousEntry] of snapshot.workspaceTaskEntries) {
    if (!Array.isArray(queryKey) || typeof queryKey[2] !== 'string') continue;
    if (!taskIdSet.has(queryKey[2])) continue;
    queryClient.setQueryData(queryKey, previousEntry);
  }

  for (const [queryKey, previousEntry] of snapshot.myTasksEntries) {
    queryClient.setQueryData<MyTasksCache>(queryKey, (currentEntry) =>
      restoreMyTasksCacheFromSnapshot(currentEntry, previousEntry, taskIdSet)
    );
  }

  for (const [queryKey, previousEntry] of snapshot.myCompletedTaskEntries) {
    queryClient.setQueryData<MyCompletedTasksCache>(queryKey, (currentEntry) =>
      restoreMyCompletedTasksCacheFromSnapshot(
        currentEntry,
        previousEntry,
        taskIdSet
      )
    );
  }
}
