import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceTaskRelationships,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { transformTaskRecord } from './transformers';

// Reorder task within the same list or move to a different list with specific position
export async function reorderTask(
  wsId: string,
  taskId: string,
  newListId: string,
  newSortKey: number
): Promise<Task> {
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : undefined;

  const { task } = await updateWorkspaceTask(
    wsId,
    taskId,
    {
      list_id: newListId,
      sort_key: newSortKey,
    },
    baseUrl ? { baseUrl } : undefined
  );

  return transformTaskRecord(task) as Task;
}

// React Query hook for reordering tasks
export function useReorderTask(boardId: string, wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      newListId,
      newSortKey,
    }: {
      taskId: string;
      newListId: string;
      newSortKey: number;
    }) => {
      return reorderTask(wsId, taskId, newListId, newSortKey);
    },
    onMutate: async ({ taskId, newListId, newSortKey }) => {
      console.log('🎭 onMutate triggered - optimistic update for reorder');

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);

      // Check if moving to a done or closed list
      const targetList = queryClient.getQueryData(['task_lists', boardId]) as
        | TaskList[]
        | undefined;
      const list = targetList?.find((l) => l.id === newListId);
      const isCompletionList =
        list?.status === 'done' || list?.status === 'closed';

      // If moving to completion list, start fetching blocked task IDs asynchronously
      // Don't await here to avoid blocking the optimistic update
      let blockedTaskIdsPromise: Promise<string[]> | null = null;
      if (isCompletionList) {
        const baseUrl =
          typeof window !== 'undefined' ? window.location.origin : undefined;
        blockedTaskIdsPromise = Promise.resolve(
          getWorkspaceTaskRelationships(
            wsId,
            taskId,
            baseUrl ? { baseUrl } : undefined
          )
        )
          .then((relationships) =>
            (relationships?.blocking ?? []).map((task) => task.id)
          )
          .catch((err: unknown) => {
            console.error('Failed to fetch blocked task IDs:', err);
            return []; // Return empty array on error to prevent breaking the flow
          });
      }

      // Optimistically update the task immediately (not blocked by the fetch above)
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id === taskId) {
              const shouldArchive =
                list?.status === 'done' || list?.status === 'closed';

              return {
                ...task,
                list_id: newListId,
                sort_key: newSortKey,
                closed_at: shouldArchive ? new Date().toISOString() : null,
              };
            }
            return task;
          });
        }
      );

      return { previousTasks, blockedTaskIdsPromise };
    },
    onError: (err, _, context) => {
      console.log('❌ onError triggered - rollback optimistic update');
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }

      console.error('Failed to reorder task:', err);
    },
    onSuccess: async (updatedTask, variables, context) => {
      console.log(
        '✅ onSuccess triggered - updating cache with server response'
      );

      // Update the cache with the server response
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) => {
            if (task.id !== updatedTask.id) {
              return task;
            }

            return {
              ...task,
              ...updatedTask,
            };
          });
        }
      );

      // If task was moved to done/closed list (has completed_at or closed_at set),
      // invalidate task relationships to reflect removed blocking relationships
      if (updatedTask.completed_at || updatedTask.closed_at) {
        // Invalidate the completed/closed task's relationships
        await queryClient.invalidateQueries({
          queryKey: ['task-relationships', variables.taskId],
        });

        // Await the blockedTaskIdsPromise to get the list of blocked tasks
        // Then invalidate all blocked tasks' relationships (they're now unblocked)
        if (context?.blockedTaskIdsPromise) {
          const blockedTaskIds = await context.blockedTaskIdsPromise;
          if (blockedTaskIds.length > 0) {
            await Promise.all(
              blockedTaskIds.map((blockedTaskId) =>
                queryClient.invalidateQueries({
                  queryKey: ['task-relationships', blockedTaskId],
                })
              )
            );
          }
        }
      }
    },
  });
}
