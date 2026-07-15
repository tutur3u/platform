'use client';

import { type QueryClient, useMutation } from '@tanstack/react-query';
import { bulkWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { toast } from '@tuturuuu/ui/sonner';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import type { BoardBroadcastFn } from '../../../../shared/board-broadcast-context';
import type { BulkOperationI18n } from './bulk-operation-i18n';
import {
  getInternalApiOptions,
  restoreBoardTaskCaches,
  restoreFailedBoardTasks,
  snapshotBoardTaskCaches,
  updateBoardTaskCaches,
} from './bulk-operation-utils';

export function useBulkAddLabel(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  workspaceLabels: WorkspaceLabel[],
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      labelId,
      taskIds,
    }: {
      labelId: string;
      taskIds: string[];
    }) => {
      const apiOptions = getInternalApiOptions();

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: {
            type: 'add_label',
            labelId,
          },
        },
        apiOptions
      );

      if (result.successCount === 0) {
        throw new Error(`Failed to add label to all ${taskIds.length} tasks`);
      }

      return {
        count: result.successCount,
        labelId,
        taskIds,
        failures: result.failures,
      };
    },
    onMutate: async ({ labelId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });
      const cacheSnapshot = snapshotBoardTaskCaches(queryClient, boardId);
      const current = cacheSnapshot.previousTasks || [];
      const labelMeta = workspaceLabels.find((l) => l.id === labelId);

      const missingTaskIds = taskIds.filter((id) => {
        const task = current.find((ct) => ct.id === id);
        return !task?.labels?.some((l) => l.id === labelId);
      });

      updateBoardTaskCaches(queryClient, boardId, (old) => {
        if (!old) return old;
        return old.map((task) => {
          if (!missingTaskIds.includes(task.id)) return task;
          return {
            ...task,
            labels: [
              ...(task.labels || []),
              {
                id: labelId,
                ws_id: wsId || labelMeta?.ws_id || '',
                name: labelMeta?.name || i18n?.defaultLabelName() || 'Label',
                color: labelMeta?.color || '#3b82f6',
                created_at: new Date().toISOString(),
              },
            ],
          } as Task;
        });
      });

      return { ...cacheSnapshot, modifiedTaskIds: missingTaskIds };
    },
    onError: (error, _, context) => {
      if (context) {
        restoreBoardTaskCaches(queryClient, boardId, context);
      }
      console.error('Bulk add label failed', error);
      toast.error(
        i18n?.failedAddLabel() ?? 'Failed to add label to selected tasks'
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

      const modifiedTaskIds = context?.modifiedTaskIds ?? data.taskIds;
      const succeededModifiedTaskIds = modifiedTaskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededModifiedTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      const labelMeta = workspaceLabels.find((l) => l.id === data.labelId);
      const labelName = labelMeta?.name || i18n?.defaultLabelName() || 'Label';

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialLabelAdditionCompletedTitle() ??
            'Partial label addition completed',
          {
            description:
              i18n?.labelAddedPartialDescription(
                labelName,
                data.count,
                data.failures.length
              ) ??
              `Added "${labelName}" to ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.labelAddedTitle() ?? 'Label added', {
          description:
            i18n?.labelAddedDescription(labelName, data.count) ??
            `Added "${labelName}" to ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}

export function useBulkRemoveLabel(
  queryClient: QueryClient,
  wsId: string,
  boardId: string,
  workspaceLabels: WorkspaceLabel[],
  broadcast?: BoardBroadcastFn | null,
  i18n?: BulkOperationI18n
) {
  return useMutation({
    mutationFn: async ({
      labelId,
      taskIds,
    }: {
      labelId: string;
      taskIds: string[];
    }) => {
      const apiOptions = getInternalApiOptions();

      const result = await bulkWorkspaceTasks(
        wsId,
        {
          taskIds,
          operation: {
            type: 'remove_label',
            labelId,
          },
        },
        apiOptions
      );

      if (result.successCount === 0) {
        throw new Error(
          `Failed to remove label from all ${taskIds.length} tasks`
        );
      }

      return {
        count: result.successCount,
        labelId,
        taskIds,
        failures: result.failures,
      };
    },
    onMutate: async ({ labelId, taskIds }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });
      await queryClient.cancelQueries({ queryKey: ['tasks-full', boardId] });
      const cacheSnapshot = snapshotBoardTaskCaches(queryClient, boardId);
      const current = cacheSnapshot.previousTasks || [];
      const modifiedTaskIds = taskIds.filter((id) => {
        const task = current.find((ct) => ct.id === id);
        return !!task?.labels?.some((label) => label.id === labelId);
      });
      const taskIdSet = new Set(taskIds);

      updateBoardTaskCaches(queryClient, boardId, (old) => {
        if (!old) return old;
        return old.map((task) =>
          taskIdSet.has(task.id)
            ? {
                ...task,
                labels: (task.labels || []).filter((l) => l.id !== labelId),
              }
            : task
        );
      });

      return { ...cacheSnapshot, modifiedTaskIds };
    },
    onError: (error, _, context) => {
      if (context) {
        restoreBoardTaskCaches(queryClient, boardId, context);
      }
      console.error('Bulk remove label failed', error);
      toast.error(
        i18n?.failedRemoveLabel() ??
          'Failed to remove label from selected tasks'
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

      const modifiedTaskIds = context?.modifiedTaskIds ?? data.taskIds;
      const succeededModifiedTaskIds = modifiedTaskIds.filter(
        (taskId) => !failedTaskIds.has(taskId)
      );

      for (const tid of succeededModifiedTaskIds) {
        broadcast?.('task:relations-changed', { taskId: tid });
      }

      const labelMeta = workspaceLabels.find((l) => l.id === data.labelId);
      const labelName = labelMeta?.name || i18n?.defaultLabelName() || 'Label';

      if (data.failures.length > 0) {
        toast.warning(
          i18n?.partialLabelRemovalCompletedTitle() ??
            'Partial label removal completed',
          {
            description:
              i18n?.labelRemovedPartialDescription(
                labelName,
                data.count,
                data.failures.length
              ) ??
              `Removed "${labelName}" from ${data.count} task${data.count === 1 ? '' : 's'}, ${data.failures.length} failed`,
          }
        );
      } else {
        toast.success(i18n?.labelRemovedTitle() ?? 'Label removed', {
          description:
            i18n?.labelRemovedDescription(labelName, data.count) ??
            `Removed "${labelName}" from ${data.count} task${data.count === 1 ? '' : 's'}`,
        });
      }
    },
  });
}
