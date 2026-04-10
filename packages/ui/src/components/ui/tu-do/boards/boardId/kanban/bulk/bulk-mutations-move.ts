'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { bulkWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
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
  type TaskMoveSnapshot = {
    task: Task;
    previousIndex: number;
  };

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
      const apiOptions = getInternalApiOptions();
      const taskTimestamps = new Map<
        string,
        { completed_at: string | null; closed_at: string | null }
      >();

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: {
            type: 'move_to_list',
            listId: targetListId,
            targetBoardId,
          },
        },
        apiOptions
      );

      for (const taskId of result.succeededTaskIds) {
        const taskMeta = result.taskMetaById?.[taskId];
        taskTimestamps.set(taskId, {
          completed_at: taskMeta?.completed_at ?? null,
          closed_at: taskMeta?.closed_at ?? null,
        });
      }

      if (result.successCount === 0) {
        throw new Error(
          `Failed to move all ${taskIds.length} tasks to board ${targetBoardId}`
        );
      }

      return {
        count: result.successCount,
        targetBoardId,
        targetListId,
        taskIds,
        movedTaskIds: result.succeededTaskIds,
        failures: result.failures,
        taskTimestamps,
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
      const previousTasksArray = Array.isArray(previousTasks)
        ? (previousTasks as Task[])
        : [];

      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => !taskIdSet.has(t.id));
        }
      );

      const tasksToMoveSnapshots: TaskMoveSnapshot[] = [];
      const tasksToMove: Task[] = [];

      for (const [index, task] of previousTasksArray.entries()) {
        if (!taskIdSet.has(task.id)) {
          continue;
        }

        tasksToMoveSnapshots.push({ task, previousIndex: index });
        tasksToMove.push(task);
      }

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

      return {
        previousTasks,
        previousTargetTasks,
        tasksToMove,
        tasksToMoveSnapshots,
      };
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
      const movedTaskIds = [...data.movedTaskIds];
      const movedTaskIdSet = new Set(movedTaskIds);
      const failedTaskSnapshots = (context?.tasksToMoveSnapshots ?? [])
        .filter((snapshot: TaskMoveSnapshot) =>
          failedTaskIds.has(snapshot.task.id)
        )
        .sort(
          (a: TaskMoveSnapshot, b: TaskMoveSnapshot) =>
            a.previousIndex - b.previousIndex
        );
      const failedTasks = failedTaskSnapshots.map(
        (snapshot: TaskMoveSnapshot) => snapshot.task
      );

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;

          const rebuilt = old.filter((task) => !movedTaskIdSet.has(task.id));

          for (const snapshot of failedTaskSnapshots) {
            const existingIndex = rebuilt.findIndex(
              (task) => task.id === snapshot.task.id
            );
            if (existingIndex >= 0) {
              rebuilt.splice(existingIndex, 1);
            }

            const safeInsertIndex = Math.min(
              Math.max(snapshot.previousIndex, 0),
              rebuilt.length
            );
            rebuilt.splice(safeInsertIndex, 0, snapshot.task);
          }

          return rebuilt;
        }
      );

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

      if (movedTaskIds.length > 0) {
        const movedTaskIdSet = new Set(movedTaskIds);
        const succeededTasks = (context?.tasksToMove ?? [])
          .filter((task) => movedTaskIdSet.has(task.id))
          .map((task) => {
            const timestamps = data.taskTimestamps.get(task.id);
            return {
              ...task,
              list_id: data.targetListId,
              completed_at: timestamps?.completed_at ?? null,
              closed_at: timestamps?.closed_at ?? null,
            };
          });

        if (succeededTasks.length === 0) {
          return;
        }

        queryClient.setQueryData(
          ['tasks', data.targetBoardId],
          (old: Task[] | undefined) => {
            if (!old) return succeededTasks;
            const failedIds = new Set(failedTasks.map((task) => task.id));
            const filteredOld = old.filter(
              (task) => !movedTaskIdSet.has(task.id) && !failedIds.has(task.id)
            );
            return [...filteredOld, ...succeededTasks];
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

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: {
            type: 'move_to_list',
            listId,
          },
        },
        apiOptions
      );

      successCount = result.successCount;
      failures.push(...result.failures);
      movedTaskIds.push(...result.succeededTaskIds);

      for (const taskId of result.succeededTaskIds) {
        const taskMeta = result.taskMetaById?.[taskId];
        taskTimestamps.set(taskId, {
          completed_at: taskMeta?.completed_at ?? null,
          closed_at: taskMeta?.closed_at ?? null,
        });
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

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: {
            type: 'move_to_list',
            listId: targetList.id,
          },
        },
        apiOptions
      );

      successCount = result.successCount;
      failures.push(...result.failures);
      movedTaskIds.push(...result.succeededTaskIds);

      for (const taskId of result.succeededTaskIds) {
        const taskMeta = result.taskMetaById?.[taskId];
        taskTimestamps.set(taskId, {
          completed_at: taskMeta?.completed_at ?? null,
          closed_at: taskMeta?.closed_at ?? null,
        });
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
