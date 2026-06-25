import type { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useRef } from 'react';
import type { BoardRealtimePayload } from './useBoardRealtime.types';

type CallbackRef<T> = {
  current: T | undefined;
};

type UseBoardRealtimeEventHandlerOptions = {
  boardId: string;
  queryClient: QueryClient;
  rememberEventId: (payload: BoardRealtimePayload) => boolean;
  onTaskChangeRef: CallbackRef<
    (task: Task, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
  >;
  onListChangeRef: CallbackRef<
    (list: TaskList, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void
  >;
  onTaskRelationsChangeRef?: CallbackRef<(taskIds: string[]) => void>;
};

function mergeRealtimeTask(
  old: Task[] | undefined,
  taskData: Partial<Task> & { id: string }
) {
  if (!old) {
    return [
      {
        ...taskData,
        assignees: taskData.assignees ?? [],
        labels: taskData.labels ?? [],
        projects: taskData.projects ?? [],
      } as Task,
    ];
  }

  const exists = old.some((task) => task.id === taskData.id);
  if (exists) {
    return old.map((task) =>
      task.id === taskData.id ? { ...task, ...taskData } : task
    );
  }

  return [
    ...old,
    {
      ...taskData,
      assignees: taskData.assignees ?? [],
      labels: taskData.labels ?? [],
      projects: taskData.projects ?? [],
    } as Task,
  ];
}

function deleteRealtimeTask(old: Task[] | undefined, taskId: string) {
  if (!old) return old;
  return old.filter((task) => task.id !== taskId);
}

function updateBoardTaskCaches(
  queryClient: QueryClient,
  boardId: string,
  updater: (old: Task[] | undefined) => Task[] | undefined
) {
  queryClient.setQueryData<Task[]>(['tasks', boardId], updater);
  queryClient.setQueryData<Task[]>(['tasks-full', boardId], updater);
  queryClient.setQueriesData<Task[]>({ queryKey: ['tasks', boardId] }, updater);
  queryClient.setQueriesData<Task[]>(
    { queryKey: ['tasks-full', boardId] },
    updater
  );
}

function patchWorkspaceTaskCaches(
  queryClient: QueryClient,
  taskData: Partial<Task> & { id: string }
) {
  queryClient.setQueriesData<{ task?: Task | null }>(
    {
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'workspaceTask' &&
        query.queryKey[2] === taskData.id,
    },
    (old) =>
      old?.task
        ? {
            ...old,
            task: { ...old.task, ...taskData },
          }
        : old
  );
}

function patchMyTasksCaches(
  queryClient: QueryClient,
  taskData: Partial<Task> & { id: string }
) {
  const patchTask = <T extends { id?: string }>(task: T): T =>
    task.id === taskData.id ? ({ ...task, ...taskData } as T) : task;

  queryClient.setQueriesData<{
    overdue?: Array<{ id?: string }>;
    today?: Array<{ id?: string }>;
    upcoming?: Array<{ id?: string }>;
    completed?: Array<{ id?: string }>;
  }>({ queryKey: ['my-tasks'] }, (old) =>
    old
      ? {
          ...old,
          overdue: old.overdue?.map(patchTask) ?? old.overdue,
          today: old.today?.map(patchTask) ?? old.today,
          upcoming: old.upcoming?.map(patchTask) ?? old.upcoming,
          completed: old.completed?.map(patchTask) ?? old.completed,
        }
      : old
  );

  queryClient.setQueriesData<{
    pages?: Array<{ completed?: Array<{ id?: string }> }>;
  }>({ queryKey: ['my-completed-tasks'] }, (old) =>
    old?.pages
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            completed: page.completed?.map(patchTask) ?? page.completed,
          })),
        }
      : old
  );
}

function deleteFromMyTasksCaches(queryClient: QueryClient, taskId: string) {
  const removeTask = <T extends { id?: string }>(tasks: T[] | undefined) =>
    tasks?.filter((task) => task.id !== taskId);

  queryClient.setQueriesData<{
    overdue?: Array<{ id?: string }>;
    today?: Array<{ id?: string }>;
    upcoming?: Array<{ id?: string }>;
    completed?: Array<{ id?: string }>;
  }>({ queryKey: ['my-tasks'] }, (old) =>
    old
      ? {
          ...old,
          overdue: removeTask(old.overdue) ?? old.overdue,
          today: removeTask(old.today) ?? old.today,
          upcoming: removeTask(old.upcoming) ?? old.upcoming,
          completed: removeTask(old.completed) ?? old.completed,
        }
      : old
  );

  queryClient.setQueriesData<{
    pages?: Array<{ completed?: Array<{ id?: string }> }>;
  }>({ queryKey: ['my-completed-tasks'] }, (old) =>
    old?.pages
      ? {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            completed: removeTask(page.completed) ?? page.completed,
          })),
        }
      : old
  );
}

function invalidateTaskMembershipQueries(
  queryClient: QueryClient,
  boardId: string
) {
  void queryClient.invalidateQueries({
    queryKey: ['task-list-counts', boardId],
  });
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const queryKey = query.queryKey;
      return (
        Array.isArray(queryKey) &&
        queryKey[0] === 'kanban-deadline-tasks' &&
        queryKey[2] === boardId
      );
    },
  });
  void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
  void queryClient.invalidateQueries({ queryKey: ['my-completed-tasks'] });
}

function invalidateTaskRelationQueries(
  queryClient: QueryClient,
  boardId: string,
  taskIds: string[]
) {
  void queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
  void queryClient.invalidateQueries({ queryKey: ['tasks-full', boardId] });
  void queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey[0] === 'workspaceTask' &&
      typeof query.queryKey[2] === 'string' &&
      taskIds.includes(query.queryKey[2]),
  });
  invalidateTaskMembershipQueries(queryClient, boardId);
}

export function useBoardRealtimeEventHandler({
  boardId,
  queryClient,
  rememberEventId,
  onTaskChangeRef,
  onListChangeRef,
  onTaskRelationsChangeRef,
}: UseBoardRealtimeEventHandlerOptions) {
  // Collects task IDs from task:relations-changed events over 150ms
  // and invalidates relation-bearing queries together.
  const pendingRelationIdsRef = useRef<Set<string>>(new Set());
  const relationInvalidationTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const invalidateBatchedRelations = useCallback(() => {
    relationInvalidationTimerRef.current = null;
    const taskIds = [...pendingRelationIdsRef.current];
    pendingRelationIdsRef.current.clear();
    if (taskIds.length === 0) return;

    if (DEV_MODE) {
      console.log(
        `[useBoardRealtime] Invalidating relations for ${taskIds.length} task(s):`,
        taskIds
      );
    }

    invalidateTaskRelationQueries(queryClient, boardId, taskIds);
  }, [boardId, queryClient]);

  const handleBoardRealtimeEvent = useCallback(
    (event: string, payload: BoardRealtimePayload) => {
      if (rememberEventId(payload)) return;

      if (event.endsWith(':batch')) {
        const baseEvent = event.slice(0, -':batch'.length);
        const payloads = Array.isArray(payload.payloads)
          ? payload.payloads
          : Array.isArray(payload.events)
            ? payload.events
                .filter((entry) => {
                  return (
                    typeof entry === 'object' &&
                    entry !== null &&
                    'payload' in entry
                  );
                })
                .map((entry) => (entry as { payload: unknown }).payload)
            : [];

        for (const childPayload of payloads) {
          if (
            typeof childPayload === 'object' &&
            childPayload !== null &&
            !Array.isArray(childPayload)
          ) {
            handleBoardRealtimeEvent(
              baseEvent,
              childPayload as BoardRealtimePayload
            );
          }
        }
        return;
      }

      if (event === 'task:upsert') {
        const taskData = payload.task as Partial<Task> & { id: string };
        if (!taskData?.id) return;
        if (DEV_MODE) {
          console.log('[useBoardRealtime] task:upsert received', taskData.id);
        }

        const current = queryClient.getQueryData<Task[]>(['tasks', boardId]);
        const eventType = current?.some((task) => task.id === taskData.id)
          ? 'UPDATE'
          : 'INSERT';
        onTaskChangeRef.current?.(taskData as Task, eventType);

        updateBoardTaskCaches(queryClient, boardId, (old) =>
          mergeRealtimeTask(old, taskData)
        );
        patchWorkspaceTaskCaches(queryClient, taskData);
        patchMyTasksCaches(queryClient, taskData);
        if (
          'list_id' in taskData ||
          'end_date' in taskData ||
          'completed' in taskData ||
          'completed_at' in taskData ||
          'closed_at' in taskData ||
          'deleted_at' in taskData
        ) {
          invalidateTaskMembershipQueries(queryClient, boardId);
        }
        return;
      }

      if (event === 'task:delete') {
        const { taskId } = payload as { taskId: string };
        if (DEV_MODE) {
          console.log('[useBoardRealtime] task:delete received', taskId);
        }

        const current = queryClient.getQueryData<Task[]>(['tasks', boardId]);
        const deleted = current?.find((t) => t.id === taskId);

        updateBoardTaskCaches(queryClient, boardId, (old) =>
          deleteRealtimeTask(old, taskId)
        );
        deleteFromMyTasksCaches(queryClient, taskId);
        queryClient.removeQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'workspaceTask' &&
            query.queryKey[2] === taskId,
        });
        invalidateTaskMembershipQueries(queryClient, boardId);

        if (deleted) {
          onTaskChangeRef.current?.(deleted, 'DELETE');
        }
        return;
      }

      if (event === 'list:upsert') {
        const listData = payload.list as Partial<TaskList> & { id: string };
        if (DEV_MODE) {
          console.log('[useBoardRealtime] list:upsert received', listData.id);
        }

        queryClient.setQueryData(
          ['task_lists', boardId],
          (old: TaskList[] | undefined) => {
            if (!old) return [listData as TaskList];
            const exists = old.some((l) => l.id === listData.id);
            if (exists) {
              onListChangeRef.current?.(listData as TaskList, 'UPDATE');
              return old.map((l) =>
                l.id === listData.id ? { ...l, ...listData } : l
              );
            }
            onListChangeRef.current?.(listData as TaskList, 'INSERT');
            return [...old, listData as TaskList];
          }
        );
        return;
      }

      if (event === 'list:delete') {
        const { listId } = payload as { listId: string };
        if (DEV_MODE) {
          console.log('[useBoardRealtime] list:delete received', listId);
        }

        const current = queryClient.getQueryData<TaskList[]>([
          'task_lists',
          boardId,
        ]);
        const deleted = current?.find((l) => l.id === listId);

        queryClient.setQueryData(
          ['task_lists', boardId],
          (old: TaskList[] | undefined) => {
            if (!old) return old;
            return old.filter((l) => l.id !== listId);
          }
        );

        updateBoardTaskCaches(queryClient, boardId, (old) =>
          old?.filter((task) => task.list_id !== listId)
        );
        invalidateTaskMembershipQueries(queryClient, boardId);

        if (deleted) {
          onListChangeRef.current?.(deleted, 'DELETE');
        }
        return;
      }

      if (event === 'task:relations-changed') {
        const p = payload as { taskId?: string; taskIds?: string[] };
        const ids = p.taskIds ?? (p.taskId ? [p.taskId] : []);

        if (DEV_MODE) {
          console.log(
            '[useBoardRealtime] task:relations-changed received',
            ids
          );
        }

        for (const id of ids) {
          pendingRelationIdsRef.current.add(id);
        }

        if (ids.length > 0) {
          onTaskRelationsChangeRef?.current?.(ids);
        }

        if (relationInvalidationTimerRef.current) {
          clearTimeout(relationInvalidationTimerRef.current);
        }
        relationInvalidationTimerRef.current = setTimeout(
          invalidateBatchedRelations,
          150
        );
        return;
      }

      if (event === 'task:deps-changed') {
        const { taskIds } = payload as { taskIds: string[] };
        if (DEV_MODE) {
          console.log('[useBoardRealtime] task:deps-changed received', taskIds);
        }
        for (const id of taskIds) {
          queryClient.invalidateQueries({
            queryKey: ['task-relationships', id],
          });
        }
      }
    },
    [
      boardId,
      invalidateBatchedRelations,
      onListChangeRef,
      onTaskRelationsChangeRef,
      onTaskChangeRef,
      queryClient,
      rememberEventId,
    ]
  );

  useEffect(() => {
    return () => {
      if (relationInvalidationTimerRef.current) {
        clearTimeout(relationInvalidationTimerRef.current);
        relationInvalidationTimerRef.current = null;
      }
      pendingRelationIdsRef.current.clear();
    };
  }, []);

  return handleBoardRealtimeEvent;
}
