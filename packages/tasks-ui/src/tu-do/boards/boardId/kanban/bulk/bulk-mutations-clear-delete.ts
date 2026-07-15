'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { bulkWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import { toast } from '@tuturuuu/ui/sonner';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import { invalidateKanbanDeadlineTasks } from '../data/kanban-deadline-query';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import {
  type BulkTaskWorkspaceGroup,
  bulkWorkspaceTasksByEffectiveWorkspace,
  getInternalApiOptions,
  restoreBoardTaskCaches,
  restoreDeletedBoardTasks,
  restoreFailedBoardTasks,
  snapshotBoardTaskCaches,
  updateBoardTaskCaches,
} from './bulk-operation-utils';

export function useBulkClearLabels(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({ taskIds }: { taskIds: string[] }) => {
      const apiOptions = getInternalApiOptions();

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: { type: 'clear_labels' },
        },
        apiOptions
      );

      if (result.successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear labels from all ${taskIds.length} tasks`
        );
      }

      return { count: result.successCount, taskIds, failures: result.failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });
      const cacheSnapshot = snapshotBoardTaskCaches(queryClient, boardId);
      const taskIdSet = new Set(taskIds);

      updateBoardTaskCaches(queryClient, boardId, (old) => {
        if (!old) return old;
        return old.map((task) =>
          taskIdSet.has(task.id) ? { ...task, labels: [] } : task
        );
      });

      return cacheSnapshot;
    },
    onError: (error, _, context) => {
      if (context) {
        restoreBoardTaskCaches(queryClient, boardId, context);
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

      restoreFailedBoardTasks({
        queryClient,
        boardId,
        previousTasks: context?.previousTasks,
        previousFullTasks: context?.previousFullTasks,
        failedTaskIds,
      });

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
      const apiOptions = getInternalApiOptions();

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: { type: 'clear_projects' },
        },
        apiOptions
      );

      if (result.successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear projects from all ${taskIds.length} tasks`
        );
      }

      return { count: result.successCount, taskIds, failures: result.failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });
      const cacheSnapshot = snapshotBoardTaskCaches(queryClient, boardId);
      const taskIdSet = new Set(taskIds);

      updateBoardTaskCaches(queryClient, boardId, (old) => {
        if (!old) return old;
        return old.map((task) =>
          taskIdSet.has(task.id) ? { ...task, projects: [] } : task
        );
      });

      return cacheSnapshot;
    },
    onError: (error, _, context) => {
      if (context) {
        restoreBoardTaskCaches(queryClient, boardId, context);
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

      restoreFailedBoardTasks({
        queryClient,
        boardId,
        previousTasks: context?.previousTasks,
        previousFullTasks: context?.previousFullTasks,
        failedTaskIds,
      });

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
      const apiOptions = getInternalApiOptions();

      const result = await bulkWorkspaceTasksByEffectiveWorkspace({
        queryClient,
        boardId,
        defaultWorkspaceId: wsId,
        taskIds,
        operation: { type: 'clear_assignees' },
        options: apiOptions,
      });

      if (result.successCount === 0 && taskIds.length > 0) {
        throw new Error(
          `Failed to clear assignees from all ${taskIds.length} tasks`
        );
      }

      return { count: result.successCount, taskIds, failures: result.failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });
      const cacheSnapshot = snapshotBoardTaskCaches(queryClient, boardId);
      const taskIdSet = new Set(taskIds);

      updateBoardTaskCaches(queryClient, boardId, (old) => {
        if (!old) return old;
        return old.map((task) =>
          taskIdSet.has(task.id) ? { ...task, assignees: [] } : task
        );
      });

      return cacheSnapshot;
    },
    onError: (error, _, context) => {
      if (context) {
        restoreBoardTaskCaches(queryClient, boardId, context);
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

      restoreFailedBoardTasks({
        queryClient,
        boardId,
        previousTasks: context?.previousTasks,
        previousFullTasks: context?.previousFullTasks,
        failedTaskIds,
      });

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
    mutationFn: async ({
      taskIds,
      workspaceGroups,
    }: {
      taskIds: string[];
      workspaceGroups?: BulkTaskWorkspaceGroup[];
    }) => {
      const apiOptions = getInternalApiOptions();

      const result = await bulkWorkspaceTasksByEffectiveWorkspace({
        queryClient,
        boardId,
        defaultWorkspaceId: wsId,
        taskIds,
        operation: {
          type: 'update_fields',
          updates: { deleted: true },
        },
        options: apiOptions,
        workspaceGroups,
      });

      if (result.successCount === 0 && taskIds.length > 0) {
        throw new Error(`Failed to delete all ${taskIds.length} tasks`);
      }

      return { count: result.successCount, taskIds, failures: result.failures };
    },
    onMutate: async ({ taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });
      const cacheSnapshot = snapshotBoardTaskCaches(queryClient, boardId);
      const taskIdSet = new Set(taskIds);

      updateBoardTaskCaches(queryClient, boardId, (old) => {
        if (!old) return old;
        return old.filter((task) => !taskIdSet.has(task.id));
      });

      return cacheSnapshot;
    },
    onError: (error, _, context) => {
      if (context) {
        restoreBoardTaskCaches(queryClient, boardId, context);
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

      restoreDeletedBoardTasks({
        queryClient,
        boardId,
        previousTasks: context?.previousTasks,
        previousFullTasks: context?.previousFullTasks,
        failedTaskIds,
      });

      const succeededTaskIds = data.taskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededTaskIds) {
        broadcast?.('task:delete', { taskId: tid });
      }
      void invalidateKanbanDeadlineTasks(queryClient, boardId);

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
