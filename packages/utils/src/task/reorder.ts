import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getWorkspaceTaskRelationships,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  isTaskBoardCompletedStatus,
  isTaskBoardResolvedStatus,
  isTaskBoardTerminalStatus,
} from '../task-list-status';
import { transformTaskRecord } from './transformers';

type ReorderTaskCacheInput = {
  taskId: string;
  newListId: string;
  newSortKey: number;
  targetListStatus?: TaskList['status'] | null;
  localMutationAt?: number;
};

type LocallyMutatedTask = Task & { _localMutationAt: number };

export function mergeOptimisticReorderedTaskIntoCache(
  tasks: Task[] | undefined,
  {
    taskId,
    newListId,
    newSortKey,
    targetListStatus,
    localMutationAt = Date.now(),
  }: ReorderTaskCacheInput
) {
  if (!tasks) return tasks;

  const targetIsCompleted = isTaskBoardCompletedStatus(targetListStatus);
  const targetIsTerminal = isTaskBoardTerminalStatus(targetListStatus);
  const mutationTimestamp = new Date(localMutationAt).toISOString();

  return tasks.map((task) => {
    if (task.id !== taskId) return task;

    return {
      ...task,
      list_id: newListId,
      sort_key: newSortKey,
      completed: targetIsCompleted,
      completed_at: targetIsCompleted
        ? (task.completed_at ?? mutationTimestamp)
        : null,
      closed_at: targetIsTerminal
        ? (task.closed_at ?? mutationTimestamp)
        : null,
      _localMutationAt: localMutationAt,
    } as LocallyMutatedTask;
  });
}

export function mergeServerReorderedTaskIntoCache(
  tasks: Task[] | undefined,
  updatedTask: Task,
  localMutationAt = Date.now()
) {
  if (!tasks) return tasks;

  return tasks.map((task) => {
    if (task.id !== updatedTask.id) return task;

    return {
      ...task,
      ...updatedTask,
      _localMutationAt: localMutationAt,
    } as LocallyMutatedTask;
  });
}

function setReorderedTaskCache(
  queryClient: QueryClient,
  boardId: string,
  updater: (tasks: Task[] | undefined) => Task[] | undefined
) {
  queryClient.setQueryData(['tasks', boardId], updater);

  if (queryClient.getQueryData<Task[]>(['tasks-full', boardId])) {
    queryClient.setQueryData(['tasks-full', boardId], updater);
  }
}

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
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot the previous value
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);
      const previousFullTasks = queryClient.getQueryData<Task[]>([
        'tasks-full',
        boardId,
      ]);

      // Check if moving to a done or closed list
      const targetList = queryClient.getQueryData(['task_lists', boardId]) as
        | TaskList[]
        | undefined;
      const list = targetList?.find((l) => l.id === newListId);
      const isCompletionList = isTaskBoardResolvedStatus(list?.status);

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
      setReorderedTaskCache(queryClient, boardId, (old) =>
        mergeOptimisticReorderedTaskIntoCache(old, {
          taskId,
          newListId,
          newSortKey,
          targetListStatus: list?.status,
        })
      );

      return { previousTasks, previousFullTasks, blockedTaskIdsPromise };
    },
    onError: (err, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      if (context?.previousFullTasks) {
        queryClient.setQueryData(
          ['tasks-full', boardId],
          context.previousFullTasks
        );
      }

      console.error('Failed to reorder task:', err);
    },
    onSuccess: async (updatedTask, variables, context) => {
      // Update the cache with the server response
      setReorderedTaskCache(queryClient, boardId, (old) =>
        mergeServerReorderedTaskIntoCache(old, updatedTask)
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
