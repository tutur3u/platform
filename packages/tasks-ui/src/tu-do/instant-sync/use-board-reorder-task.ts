'use client';

import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { getWorkspaceTaskRelationships } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { useReorderTask } from '@tuturuuu/utils/task-helper';
import { isTaskBoardResolvedStatus } from '@tuturuuu/utils/task-list-status';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { InstantReorderInput } from './board-task-actions';
import { useInstantBoardSync } from './instant-board-sync-context';

type ReorderVariables = Omit<InstantReorderInput, 'targetListStatus'> & {
  optimisticPreviousFullTasks?: Task[];
};

/** Ids this task was blocking, fetched before a move to a resolved list. */
function loadBlockedTaskIds(wsId: string, taskId: string) {
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  return Promise.resolve(
    getWorkspaceTaskRelationships(
      wsId,
      taskId,
      baseUrl ? { baseUrl } : undefined
    )
  )
    .then((relationships) =>
      (relationships?.blocking ?? []).map((task) => task.id)
    )
    .catch((error: unknown) => {
      console.error('Failed to fetch blocked task IDs:', error);
      return [] as string[];
    });
}

type ReorderCallbacks = {
  onError?: (error: unknown, variables: ReorderVariables) => void;
  onSettled?: (
    task: Task | undefined,
    error: unknown,
    variables: ReorderVariables
  ) => void;
  onSuccess?: (task: Task, variables: ReorderVariables) => void;
};

/**
 * The kanban's reorder mutation. With the instant sync pilot enabled it routes
 * through a TanStack DB transaction (row-level rollback, live overlay) while
 * keeping the `mutate` / `mutateAsync` shape the drag-and-drop code expects.
 */
export function useBoardReorderTask(boardId: string, wsId: string) {
  const legacy = useReorderTask(boardId, wsId);
  const sync = useInstantBoardSync();
  const queryClient = useQueryClient();
  const t = useTranslations('ws-tasks');
  const revertedMessage = t('failed_update_task_reverted');

  const instant = useMemo(() => {
    if (!sync || sync.boardId !== boardId) return null;

    const mutateAsync = async (
      variables: ReorderVariables,
      callbacks: ReorderCallbacks = {}
    ) => {
      const lists = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        boardId,
      ]);
      const targetListStatus = lists?.find(
        (list) => list.id === variables.newListId
      )?.status;
      const blockedTaskIds = isTaskBoardResolvedStatus(targetListStatus)
        ? loadBlockedTaskIds(wsId, variables.taskId)
        : null;
      const fullEntries: [QueryKey, Task[] | undefined][] | undefined =
        variables.optimisticPreviousFullTaskEntries ??
        (variables.optimisticPreviousFullTasks
          ? [[['tasks-full', boardId], variables.optimisticPreviousFullTasks]]
          : undefined);

      try {
        const task = await sync.actions.reorderTask({
          taskId: variables.taskId,
          newListId: variables.newListId,
          newSortKey: variables.newSortKey,
          optimisticPreviousTasks: variables.optimisticPreviousTasks,
          optimisticPreviousFullTaskEntries: fullEntries,
          targetListStatus,
        });
        if (task.completed_at || task.closed_at) {
          void queryClient.invalidateQueries({
            queryKey: ['task-relationships', variables.taskId],
          });
          void blockedTaskIds?.then((ids) =>
            Promise.all(
              ids.map((id) =>
                queryClient.invalidateQueries({
                  queryKey: ['task-relationships', id],
                })
              )
            )
          );
        }
        callbacks.onSuccess?.(task, variables);
        callbacks.onSettled?.(task, null, variables);
        return task;
      } catch (error) {
        callbacks.onError?.(error, variables);
        callbacks.onSettled?.(undefined, error, variables);
        throw error;
      }
    };

    return {
      mutateAsync,
      mutate: (variables: ReorderVariables, callbacks?: ReorderCallbacks) => {
        mutateAsync(variables, callbacks).catch((error: unknown) => {
          console.error('Failed to reorder task:', error);
          toast.error(revertedMessage);
        });
      },
    };
  }, [boardId, queryClient, revertedMessage, sync, wsId]);

  return instant ?? legacy;
}
