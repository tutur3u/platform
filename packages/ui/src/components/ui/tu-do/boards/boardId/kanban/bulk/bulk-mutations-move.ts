'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { moveWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import { getInternalApiOptions } from './bulk-operation-utils';

export function useBulkMoveToBoard(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      targetBoardId,
      targetListId,
      taskIds,
    }: {
      targetBoardId: string;
      targetListId: string;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      const movedTasks: Task[] = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          const result = await moveWorkspaceTask(
            wsId,
            taskId,
            {
              list_id: targetListId,
              target_board_id: targetBoardId,
            },
            apiOptions
          );
          movedTasks.push(result.task);
          successCount++;
        } catch (error: unknown) {
          let fallbackError = 'Unknown error';
          if (typeof error !== 'undefined') {
            try {
              fallbackError = JSON.stringify(error) || fallbackError;
            } catch {
              fallbackError = String(error);
            }
          }

          const errorMessage =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : fallbackError;
          failures.push({
            taskId,
            error: errorMessage,
          });
        }
      }

      if (successCount === 0) {
        throw new Error(
          `Failed to move all ${taskIds.length} tasks to board ${targetBoardId}`
        );
      }

      return {
        count: successCount,
        targetBoardId,
        targetListId,
        taskIds,
        failures,
        movedTasks,
      };
    },
    onMutate: async ({ targetBoardId, targetListId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks', targetBoardId] });

      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const previousTargetTasks = queryClient.getQueryData([
        'tasks',
        targetBoardId,
      ]);

      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => !taskIdSet.has(t.id));
        }
      );

      const tasksToMove = (previousTasks as Task[] | undefined)?.filter((t) =>
        taskIdSet.has(t.id)
      );

      if (tasksToMove?.length) {
        queryClient.setQueryData(
          ['tasks', targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            const optimisticMovedTasks = tasksToMove.map((t) => ({
              ...t,
              list_id: targetListId,
            }));
            return [...old, ...optimisticMovedTasks];
          }
        );
      }

      return { previousTasks, previousTargetTasks, tasksToMove };
    },
    onError: (error, variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      if (context?.previousTargetTasks) {
        queryClient.setQueryData(
          ['tasks', variables.targetBoardId],
          context.previousTargetTasks
        );
      }
      console.error('Bulk move to board failed', error);
      toast.error(
        i18n?.failedMoveToAnotherBoard() ??
          'Failed to move selected tasks to another board'
      );
    },
    onSuccess: (data, _variables, context) => {
      const failedTaskIds = new Set(
        data.failures.map((failure) => failure.taskId)
      );
      const movedTaskIds = data.taskIds.filter((id) => !failedTaskIds.has(id));
      const movedIds = new Set(movedTaskIds);
      const failedTasks = (context?.tasksToMove ?? []).filter((task) =>
        failedTaskIds.has(task.id)
      );

      if (failedTasks.length > 0) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            const existing = old ?? [];
            const failedIdSet = new Set(failedTasks.map((task) => task.id));
            const preserved = existing.filter(
              (task) => !failedIdSet.has(task.id)
            );
            return [...preserved, ...failedTasks];
          }
        );
      }

      for (const tid of movedTaskIds) {
        broadcast?.('task:delete', { taskId: tid });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialMoveCompletedTitle() ?? 'Partial move completed',
          {
            description:
              i18n?.movedPartialDescription(data.count, data.failures.length) ??
              `${data.count} task${data.count === 1 ? '' : 's'} moved, ${data.failures.length} failed to move`,
          }
        );
      } else {
        toast.success(
          i18n?.tasksMovedToBoardTitle() ?? 'Tasks moved to board',
          {
            description:
              i18n?.movedDescription(data.count) ??
              `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
          }
        );
      }

      if (data.movedTasks.length > 0) {
        queryClient.setQueryData(
          ['tasks', data.targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return data.movedTasks;
            const failedIds = new Set(failedTasks.map((task) => task.id));
            const filteredOld = old.filter(
              (task) => !movedIds.has(task.id) && !failedIds.has(task.id)
            );
            return [...filteredOld, ...data.movedTasks];
          }
        );
      }
    },
  });
}

export function useBulkMoveToList(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      listId,
      listName,
      taskIds,
    }: {
      listId: string;
      listName: string;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const movedTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const taskTimestamps = new Map<
        string,
        { completed_at: string | null; closed_at: string | null }
      >();
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          const { task: updatedTask } = await moveWorkspaceTask(
            wsId,
            taskId,
            { list_id: listId },
            apiOptions
          );
          taskTimestamps.set(taskId, {
            completed_at: updatedTask.completed_at ?? null,
            closed_at: updatedTask.closed_at ?? null,
          });
          movedTaskIds.push(taskId);
          successCount++;
        } catch (error) {
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0) {
        throw new Error(`Failed to move all ${taskIds.length} tasks to list`);
      }

      return {
        count: successCount,
        listId,
        listName,
        taskIds,
        movedTaskIds,
        failures,
        taskTimestamps,
      };
    },
    onMutate: async ({ listId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, list_id: listId } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk move to list failed', error);
      toast.error(
        i18n?.failedMoveSelectedTasks() ?? 'Failed to move selected tasks'
      );
    },
    onSuccess: (data, _variables, context) => {
      const failedTaskIds = new Set(
        data.failures.map((failure) => failure.taskId)
      );

      if (failedTaskIds.size > 0 && Array.isArray(context?.previousTasks)) {
        const previousTaskMap = new Map(
          (context.previousTasks as Task[]).map((task) => [task.id, task])
        );

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (!failedTaskIds.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            const timestamps = data.taskTimestamps.get(t.id);
            return timestamps
              ? {
                  ...t,
                  completed_at: timestamps.completed_at,
                  closed_at: timestamps.closed_at,
                }
              : t;
          });
        }
      );

      for (const tid of data.movedTaskIds) {
        const timestamps = data.taskTimestamps.get(tid);
        broadcast?.('task:upsert', {
          task: {
            id: tid,
            list_id: data.listId,
            completed_at: timestamps?.completed_at,
            closed_at: timestamps?.closed_at,
          },
        });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialMoveCompletedTitle() ?? 'Partial move completed',
          {
            description:
              i18n?.movedPartialDescription(data.count, data.failures.length) ??
              `${data.count} task${data.count === 1 ? '' : 's'} moved, ${data.failures.length} failed to move`,
          }
        );
      } else {
        toast.success(
          i18n?.tasksMovedToListTitle(data.listName) ??
            `Tasks moved to ${data.listName}`,
          {
            description:
              i18n?.movedDescription(data.count) ??
              `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
          }
        );
      }
    },
  });
}

export function useBulkMoveToStatus(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  columns: TaskList[],
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      status,
      taskIds,
    }: {
      status: 'done' | 'closed';
      taskIds: string[];
    }) => {
      const targetList = columns.find((c) => c.status === status);
      if (!targetList) throw new Error(`No ${status} list found`);

      let successCount = 0;
      const movedTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const taskTimestamps = new Map<
        string,
        { completed_at: string | null; closed_at: string | null }
      >();
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          const { task: updatedTask } = await moveWorkspaceTask(
            wsId,
            taskId,
            { list_id: targetList.id },
            apiOptions
          );
          taskTimestamps.set(taskId, {
            completed_at: updatedTask.completed_at ?? null,
            closed_at: updatedTask.closed_at ?? null,
          });
          movedTaskIds.push(taskId);
          successCount++;
        } catch (error) {
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0) {
        throw new Error(
          `Failed to move all ${taskIds.length} tasks to ${status}`
        );
      }

      return {
        count: successCount,
        status,
        targetListId: targetList.id,
        taskIds,
        movedTaskIds,
        failures,
        taskTimestamps,
      };
    },
    onMutate: async ({ status, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const targetList = columns.find((c) => c.status === status);
      if (!targetList) return { previousTasks };

      const taskIdSet = new Set(taskIds);
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, list_id: targetList.id } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk status move failed', error);
      toast.error(
        i18n?.failedMoveSelectedTasks() ?? 'Failed to move selected tasks'
      );
    },
    onSuccess: (data, _variables, context) => {
      const failedTaskIds = new Set(
        data.failures.map((failure) => failure.taskId)
      );

      if (failedTaskIds.size > 0 && Array.isArray(context?.previousTasks)) {
        const previousTaskMap = new Map(
          (context.previousTasks as Task[]).map((task) => [task.id, task])
        );

        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) => {
              if (!failedTaskIds.has(task.id)) return task;
              return previousTaskMap.get(task.id) ?? task;
            });
          }
        );
      }

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => {
            const timestamps = data.taskTimestamps.get(t.id);
            return timestamps
              ? {
                  ...t,
                  completed_at: timestamps.completed_at,
                  closed_at: timestamps.closed_at,
                }
              : t;
          });
        }
      );

      for (const tid of data.movedTaskIds) {
        const timestamps = data.taskTimestamps.get(tid);
        broadcast?.('task:upsert', {
          task: {
            id: tid,
            list_id: data.targetListId,
            completed_at: timestamps?.completed_at,
            closed_at: timestamps?.closed_at,
          },
        });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialMoveCompletedTitle() ?? 'Partial move completed',
          {
            description:
              i18n?.movedPartialDescription(data.count, data.failures.length) ??
              `${data.count} task${data.count === 1 ? '' : 's'} moved, ${data.failures.length} failed to move`,
          }
        );
      } else {
        toast.success(
          i18n?.tasksMovedToStatusTitle(data.status) ??
            `Tasks moved to ${data.status}`,
          {
            description:
              i18n?.movedDescription(data.count) ??
              `${data.count} task${data.count === 1 ? '' : 's'} moved successfully`,
          }
        );
      }
    },
  });
}
