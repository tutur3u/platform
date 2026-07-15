'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';

/** Fields that can be reverted */
export type RevertibleField =
  | 'name'
  | 'description'
  | 'priority'
  | 'start_date'
  | 'end_date'
  | 'estimation_points'
  | 'list_id'
  | 'completed'
  | 'assignees'
  | 'labels'
  | 'projects';

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

interface RevertResponse {
  success: boolean;
  revertedFields: RevertibleField[];
  task: Record<string, unknown>;
}

interface UseTaskRevertProps {
  wsId: string;
  taskId: string;
  boardId: string;
  onSuccess?: () => void;
  t?: (key: string, options?: { defaultValue?: string }) => string;
}

/**
 * Hook to revert task fields to a historical snapshot state
 */
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
    mutationFn: async ({
      historyId,
      fields,
    }: {
      historyId: string;
      fields: RevertibleField[];
    }): Promise<RevertResponse> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/revert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ historyId, fields }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revert');
      }

      return response.json();
    },
    onSuccess: async (data) => {
      // Update task cache directly with the reverted task data
      // This avoids full-board refetch flickering and conflicts with realtime sync
      if (data.task) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (old: Task[] | undefined) => {
            if (!old) return old;
            return old.map((task) =>
              task.id === taskId
                ? { ...task, ...(data.task as Partial<Task>) }
                : task
            );
          }
        );
      }

      // Only invalidate time tracking since task availability affects it
      await queryClient.invalidateQueries({
        queryKey: ['time-tracking-data'],
      });

      // Invalidate task history to show the revert action
      await queryClient.invalidateQueries({
        queryKey: ['task-history', wsId, taskId],
      });

      // Invalidate any cached snapshots
      await queryClient.invalidateQueries({
        queryKey: ['task-snapshot', wsId, taskId],
      });

      toast({
        title: t('revert_success_title', { defaultValue: 'Changes reverted' }),
        description: t('revert_success_description', {
          defaultValue: `Successfully reverted ${data.revertedFields.length} field(s)`,
        }),
      });

      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: t('revert_error_title', { defaultValue: 'Revert failed' }),
        description:
          error.message ||
          t('revert_error_description', { defaultValue: 'Please try again' }),
        variant: 'destructive',
      });
    },
  });
}
