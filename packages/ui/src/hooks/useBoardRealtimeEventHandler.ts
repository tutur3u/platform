import type { QueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { useCallback, useEffect, useRef } from 'react';
import type { BoardRealtimePayload } from './useBoardRealtime.types';

type TaskRelationRow = {
  id: string;
  assignees?: Array<{ user: NonNullable<Task['assignees']>[number] | null }>;
  labels?: Array<{ label: NonNullable<Task['labels']>[number] | null }>;
  projects?: Array<{ project: NonNullable<Task['projects']>[number] | null }>;
};

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
};

const isDefined = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export function useBoardRealtimeEventHandler({
  boardId,
  queryClient,
  rememberEventId,
  onTaskChangeRef,
  onListChangeRef,
}: UseBoardRealtimeEventHandlerOptions) {
  // Collects task IDs from task:relations-changed events over 150ms
  // and batch-fetches all relations in one query.
  const pendingRelationIdsRef = useRef<Set<string>>(new Set());
  const relationFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const fetchBatchedRelations = useCallback(async () => {
    relationFetchTimerRef.current = null;
    const taskIds = [...pendingRelationIdsRef.current];
    pendingRelationIdsRef.current.clear();
    if (taskIds.length === 0) return;

    if (DEV_MODE) {
      console.log(
        `[useBoardRealtime] Batch-fetching relations for ${taskIds.length} task(s):`,
        taskIds
      );
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `
            id,
            assignees:task_assignees(
              user:users(id, display_name, avatar_url)
            ),
            labels:task_labels(
              label:workspace_task_labels(id, name, color, created_at)
            ),
            projects:task_project_tasks(
              project:task_projects(id, name, status)
            )
          `
        )
        .in('id', taskIds);

      if (error || !data) {
        if (DEV_MODE) {
          console.error(
            '[useBoardRealtime] Failed to batch-fetch relations:',
            error
          );
        }
        return;
      }

      const relationsMap = new Map<
        string,
        {
          assignees: NonNullable<Task['assignees']>;
          labels: NonNullable<Task['labels']>;
          projects: NonNullable<Task['projects']>;
        }
      >();
      for (const d of data as TaskRelationRow[]) {
        relationsMap.set(d.id, {
          assignees: d.assignees?.map((a) => a.user).filter(isDefined) || [],
          labels: d.labels?.map((l) => l.label).filter(isDefined) || [],
          projects: d.projects?.map((p) => p.project).filter(isDefined) || [],
        });
      }

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            const relations = relationsMap.get(task.id);
            return relations ? { ...task, ...relations } : task;
          });
        }
      );
    } catch (err) {
      if (DEV_MODE) {
        console.error(
          '[useBoardRealtime] Error batch-fetching relations:',
          err
        );
      }
    }
  }, [boardId, queryClient]);

  const handleBoardRealtimeEvent = useCallback(
    (event: string, payload: BoardRealtimePayload) => {
      if (rememberEventId(payload)) return;

      if (event === 'task:upsert') {
        const taskData = payload.task as Partial<Task> & { id: string };
        if (DEV_MODE) {
          console.log('[useBoardRealtime] task:upsert received', taskData.id);
        }

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
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
            const exists = old.some((t) => t.id === taskData.id);
            if (exists) {
              onTaskChangeRef.current?.(taskData as Task, 'UPDATE');
              return old.map((t) =>
                t.id === taskData.id ? { ...t, ...taskData } : t
              );
            }
            onTaskChangeRef.current?.(taskData as Task, 'INSERT');
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
        );
        return;
      }

      if (event === 'task:delete') {
        const { taskId } = payload as { taskId: string };
        if (DEV_MODE) {
          console.log('[useBoardRealtime] task:delete received', taskId);
        }

        const current = queryClient.getQueryData<Task[]>(['tasks', boardId]);
        const deleted = current?.find((t) => t.id === taskId);

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.filter((t) => t.id !== taskId);
          }
        );

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

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.filter((t) => t.list_id !== listId);
          }
        );

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

        if (relationFetchTimerRef.current) {
          clearTimeout(relationFetchTimerRef.current);
        }
        relationFetchTimerRef.current = setTimeout(fetchBatchedRelations, 150);
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
      fetchBatchedRelations,
      onListChangeRef,
      onTaskChangeRef,
      queryClient,
      rememberEventId,
    ]
  );

  useEffect(() => {
    return () => {
      if (relationFetchTimerRef.current) {
        clearTimeout(relationFetchTimerRef.current);
        relationFetchTimerRef.current = null;
      }
      pendingRelationIdsRef.current.clear();
    };
  }, []);

  return handleBoardRealtimeEvent;
}
