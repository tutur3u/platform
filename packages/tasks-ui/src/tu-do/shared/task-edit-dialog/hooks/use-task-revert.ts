'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type RevertibleTaskHistoryField,
  revertWorkspaceTaskHistory,
} from '@tuturuuu/internal-api/task-history';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import type { TaskSnapshot } from '@tuturuuu/utils/task-snapshot';
import {
  applyOptimisticTaskPatch,
  patchTaskInVisibleCaches,
  restoreTaskFieldsFromVisibleCacheSnapshot,
  settleOptimisticTaskPatch,
  snapshotVisibleTaskCaches,
  type VisibleTaskCacheSnapshot,
} from '../../task-cache-patches';
import {
  applyTaskHistorySnapshot,
  restoreTaskHistoryFields,
} from './task-revert-optimistic';

export type RevertibleField = RevertibleTaskHistoryField;

export const CORE_FIELDS: RevertibleField[] = [
  'name',
  'description',
  'priority',
  'start_date',
  'end_date',
  'estimation_points',
  'list_id',
  'completed',
];

export const RELATIONSHIP_FIELDS: RevertibleField[] = [
  'assignees',
  'labels',
  'projects',
];

interface UseTaskRevertProps {
  wsId: string;
  taskId: string;
  boardId: string;
  onSuccess?: () => void;
  t?: (
    key: string,
    options?: { count?: number; defaultValue?: string }
  ) => string;
}

interface RevertVariables {
  historyId: string;
  fields: RevertibleField[];
  snapshot: TaskSnapshot;
}

interface RevertContext {
  cacheSnapshot: VisibleTaskCacheSnapshot;
  mutationId: string;
}

export function useTaskRevert({
  wsId,
  taskId,
  boardId,
  onSuccess,
  t = (key, opts) => opts?.defaultValue || key,
}: UseTaskRevertProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ historyId, fields }: RevertVariables) =>
      revertWorkspaceTaskHistory(wsId, taskId, { historyId, fields }),
    onMutate: async ({ fields, snapshot }): Promise<RevertContext> => {
      await Promise.all([
        queryClient.cancelQueries(
          { queryKey: ['tasks', boardId] },
          { revert: false }
        ),
        queryClient.cancelQueries(
          { queryKey: ['tasks-full', boardId] },
          { revert: false }
        ),
        queryClient.cancelQueries(
          { queryKey: ['task', taskId] },
          { revert: false }
        ),
      ]);

      const cacheSnapshot = snapshotVisibleTaskCaches(queryClient, boardId, [
        taskId,
      ]);
      const now = new Date().toISOString();
      const mutationId = applyOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: [taskId],
        updater: (task) =>
          applyTaskHistorySnapshot({ task, snapshot, fields, now }),
      });

      return { cacheSnapshot, mutationId };
    },
    onSuccess: async (data, variables, context) => {
      patchTaskInVisibleCaches({
        queryClient,
        boardId,
        taskId,
        updater: (task) => ({ ...task, ...(data.task as Partial<Task>) }),
      });
      settleOptimisticTaskPatch({
        queryClient,
        boardId,
        taskIds: [taskId],
        mutationId: context.mutationId,
        clearLocalMutationAt: true,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks', boardId] }),
        queryClient.invalidateQueries({ queryKey: ['tasks-full', boardId] }),
        queryClient.invalidateQueries({ queryKey: ['task', taskId] }),
        queryClient.invalidateQueries({
          queryKey: ['task-history', wsId, taskId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-snapshot', wsId, taskId],
        }),
        queryClient.invalidateQueries({ queryKey: ['time-tracking-data'] }),
      ]);

      toast({
        title: t('revert_success_title', { defaultValue: 'Version restored' }),
        description: t('revert_success_description', {
          count: variables.fields.length,
          defaultValue: `Restored ${variables.fields.length} field(s)`,
        }),
      });
      onSuccess?.();
    },
    onError: (error: Error, variables, context) => {
      if (context) {
        restoreTaskFieldsFromVisibleCacheSnapshot({
          queryClient,
          boardId,
          snapshot: context.cacheSnapshot,
          taskIds: [taskId],
          restore: (currentTask, previousTask) =>
            restoreTaskHistoryFields({
              currentTask,
              previousTask,
              fields: variables.fields,
            }),
        });
        settleOptimisticTaskPatch({
          queryClient,
          boardId,
          taskIds: [taskId],
          mutationId: context.mutationId,
          clearLocalMutationAt: true,
        });
      }

      toast({
        title: t('revert_error_title', { defaultValue: 'Restore failed' }),
        description:
          error.message ||
          t('revert_error_description', { defaultValue: 'Please try again' }),
        variant: 'destructive',
      });
    },
  });
}
