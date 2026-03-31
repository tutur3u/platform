'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { updateWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import {
  getInternalApiOptions,
  resolveDueDatePreset,
} from './bulk-operation-utils';

export function useBulkUpdatePriority(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      priority,
      taskIds,
    }: {
      priority: Task['priority'] | null;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const succeededTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(wsId, taskId, { priority }, apiOptions);
          succeededTaskIds.push(taskId);
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
          `Failed to update priority for all ${taskIds.length} tasks`
        );
      }

      return {
        count: successCount,
        priority,
        taskIds,
        failures,
        succeededTaskIds,
      };
    },
    onMutate: async ({ priority, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) => (taskIdSet.has(t.id) ? { ...t, priority } : t));
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk priority update failed', error);
      toast.error(
        i18n?.failedUpdatePriority() ??
          'Failed to update priority for selected tasks'
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

      for (const tid of data.succeededTaskIds) {
        broadcast?.('task:upsert', {
          task: { id: tid, priority: data.priority },
        });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialUpdateCompletedTitle() ?? 'Partial update completed',
          {
            description:
              i18n?.updatedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
          }
        );
      } else {
        toast.success(i18n?.priorityUpdatedTitle() ?? 'Priority updated', {
          description:
            i18n?.updatedDescription(data.count) ??
            `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}

export function useBulkUpdateEstimation(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      points,
      taskIds,
    }: {
      points: number | null;
      taskIds: string[];
    }) => {
      let successCount = 0;
      const succeededTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(
            wsId,
            taskId,
            { estimation_points: points },
            apiOptions
          );
          succeededTaskIds.push(taskId);
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
          `Failed to update estimation for all ${taskIds.length} tasks`
        );
      }

      return {
        count: successCount,
        points,
        taskIds,
        failures,
        succeededTaskIds,
      };
    },
    onMutate: async ({ points, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, estimation_points: points } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk estimation update failed', error);
      toast.error(
        i18n?.failedUpdateEstimation() ??
          'Failed to update estimation for selected tasks'
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

      for (const tid of data.succeededTaskIds) {
        broadcast?.('task:upsert', {
          task: { id: tid, estimation_points: data.points },
        });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialUpdateCompletedTitle() ?? 'Partial update completed',
          {
            description:
              i18n?.updatedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
          }
        );
      } else {
        toast.success(i18n?.estimationUpdatedTitle() ?? 'Estimation updated', {
          description:
            i18n?.updatedDescription(data.count) ??
            `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}

export function useBulkUpdateDueDate(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  weekStartsOn: 0 | 1 | 6,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      preset,
      taskIds,
    }: {
      preset: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'clear';
      taskIds: string[];
    }) => {
      const newDate = resolveDueDatePreset(preset, weekStartsOn);
      let successCount = 0;
      const succeededTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(
            wsId,
            taskId,
            { end_date: newDate },
            apiOptions
          );
          succeededTaskIds.push(taskId);
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
          `Failed to update due date for all ${taskIds.length} tasks`
        );
      }

      return {
        count: successCount,
        end_date: newDate,
        taskIds,
        failures,
        succeededTaskIds,
      };
    },
    onMutate: async ({ preset, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const newDate = resolveDueDatePreset(preset, weekStartsOn);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, end_date: newDate } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk due date update failed', error);
      toast.error(
        i18n?.failedUpdateDueDate() ??
          'Failed to update due date for selected tasks'
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

      for (const tid of data.succeededTaskIds) {
        broadcast?.('task:upsert', {
          task: { id: tid, end_date: data.end_date },
        });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialUpdateCompletedTitle() ?? 'Partial update completed',
          {
            description:
              i18n?.updatedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
          }
        );
      } else {
        toast.success(i18n?.dueDateUpdatedTitle() ?? 'Due date updated', {
          description:
            i18n?.updatedDescription(data.count) ??
            `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}

export function useBulkUpdateCustomDueDate(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      date,
      taskIds,
    }: {
      date: Date | null;
      taskIds: string[];
    }) => {
      const newDate = date ? date.toISOString() : null;
      let successCount = 0;
      const succeededTaskIds: string[] = [];
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(
            wsId,
            taskId,
            { end_date: newDate },
            apiOptions
          );
          succeededTaskIds.push(taskId);
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
          `Failed to update due date for all ${taskIds.length} tasks`
        );
      }

      return {
        count: successCount,
        end_date: newDate,
        taskIds,
        failures,
        succeededTaskIds,
      };
    },
    onMutate: async ({ date, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const newDate = date ? date.toISOString() : null;
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((t) =>
            taskIdSet.has(t.id) ? { ...t, end_date: newDate } : t
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk custom due date update failed', error);
      toast.error(
        i18n?.failedUpdateDueDate() ??
          'Failed to update due date for selected tasks'
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

      for (const tid of data.succeededTaskIds) {
        broadcast?.('task:upsert', {
          task: { id: tid, end_date: data.end_date },
        });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialUpdateCompletedTitle() ?? 'Partial update completed',
          {
            description:
              i18n?.updatedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `${data.count} task${data.count === 1 ? '' : 's'} updated, ${data.failures.length} failed to update`,
          }
        );
      } else {
        toast.success(i18n?.dueDateUpdatedTitle() ?? 'Due date updated', {
          description:
            i18n?.updatedDescription(data.count) ??
            `${data.count} task${data.count === 1 ? '' : 's'} updated`,
        });
      }
    },
  });
}
