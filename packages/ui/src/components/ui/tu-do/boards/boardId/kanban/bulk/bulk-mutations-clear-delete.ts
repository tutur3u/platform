'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { updateWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import { getInternalApiOptions } from './bulk-operation-utils';

export function useBulkClearLabels(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(
            wsId,
            taskId,
            { label_ids: [] },
            apiOptions
          );
          successCount++;
        } catch (error) {
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear labels from all ${taskIds.length} tasks`
        );
      }

      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            taskIdSet.has(task.id) ? { ...task, labels: [] } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk clear labels failed', error);
      toast.error(
        i18n?.failedClearLabels() ??
          'Failed to clear labels from selected tasks'
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

      const succeededTaskIds = data.taskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialLabelClearCompletedTitle() ??
            'Partial label clear completed',
          {
            description:
              i18n?.labelsClearedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `Cleared labels from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.labelsClearedTitle() ?? 'Labels cleared', {
          description:
            i18n?.labelsClearedDescription(data.count) ??
            `Cleared all labels from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

export function useBulkClearProjects(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(
            wsId,
            taskId,
            { project_ids: [] },
            apiOptions
          );
          successCount++;
        } catch (error) {
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear projects from all ${taskIds.length} tasks`
        );
      }

      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            taskIdSet.has(task.id) ? { ...task, projects: [] } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk clear projects failed', error);
      toast.error(
        i18n?.failedClearProjects() ??
          'Failed to clear projects from selected tasks'
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

      const succeededTaskIds = data.taskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialProjectClearCompletedTitle() ??
            'Partial project clear completed',
          {
            description:
              i18n?.projectsClearedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `Cleared projects from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.projectsClearedTitle() ?? 'Projects cleared', {
          description:
            i18n?.projectsClearedDescription(data.count) ??
            `Cleared all projects from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

export function useBulkClearAssignees(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(
            wsId,
            taskId,
            { assignee_ids: [] },
            apiOptions
          );
          successCount++;
        } catch (error) {
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear assignees from all ${taskIds.length} tasks`
        );
      }

      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            taskIdSet.has(task.id) ? { ...task, assignees: [] } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk clear assignees failed', error);
      toast.error(
        i18n?.failedClearAssignees() ??
          'Failed to clear assignees from selected tasks'
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

      const succeededTaskIds = data.taskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialAssigneeClearCompletedTitle() ??
            'Partial assignee clear completed',
          {
            description:
              i18n?.assigneesClearedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `Cleared assignees from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.assigneesClearedTitle() ?? 'Assignees cleared', {
          description:
            i18n?.assigneesClearedDescription(data.count) ??
            `Cleared all assignees from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

export function useBulkDeleteTasks(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  clearSelection: () => void,
  setBulkDeleteOpen: (open: boolean) => void,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      let successCount = 0;
      const failures: Array<{ taskId: string; error: string }> = [];
      const apiOptions = getInternalApiOptions();

      for (const taskId of taskIds) {
        try {
          await updateWorkspaceTask(
            wsId,
            taskId,
            { deleted: true },
            apiOptions
          );
          successCount++;
        } catch (error) {
          failures.push({
            taskId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (successCount === 0) {
        throw new Error(`Failed to delete all ${taskIds.length} tasks`);
      }

      return { count: successCount, taskIds, failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      const previousTasks = queryClient.getQueryData(['tasks', boardId]);
      const taskIdSet = new Set(taskIds);

      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((task) => !taskIdSet.has(task.id));
        }
      );

      return { previousTasks };
    },
    onError: (error, _, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      console.error('Bulk delete failed', error);
      toast.error(
        i18n?.failedDeleteTasks() ?? 'Failed to delete selected tasks'
      );
    },
    onSuccess: (data, _variables, context) => {
      const failedTaskIds = new Set(
        data.failures.map((failure) => failure.taskId)
      );

      if (failedTaskIds.size > 0 && Array.isArray(context?.previousTasks)) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            const existing = old ?? [];
            const existingById = new Map(
              existing.map((task) => [task.id, task])
            );
            const previousTasks = context.previousTasks as Task[];
            const previousOrder = new Map(
              previousTasks.map((task, index) => [task.id, index])
            );

            for (const previousTask of previousTasks) {
              if (!failedTaskIds.has(previousTask.id)) {
                continue;
              }

              existingById.set(previousTask.id, previousTask);
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
          }
        );
      }

      const succeededTaskIds = data.taskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededTaskIds) {
        broadcast?.('task:delete', { taskId: tid });
      }

      clearSelection();
      setBulkDeleteOpen(false);

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialDeletionCompletedTitle() ?? 'Partial deletion completed',
          {
            description:
              i18n?.deletedPartialDescription(
                data.count,
                data.failures.length
              ) ??
              `${data.count} task${data.count === 1 ? '' : 's'} deleted, ${data.failures.length} failed to delete`,
          }
        );
      } else {
        toast.success(
          i18n?.deletedSelectedTasksTitle() ?? 'Deleted selected tasks'
        );
      }
    },
  });
}
