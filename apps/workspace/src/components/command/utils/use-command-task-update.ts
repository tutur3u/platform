'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { commandTaskQueryKey, type TaskSearchResult } from './use-task-search';

export function useCommandTaskUpdate(wsId: string | null) {
  const t = useTranslations('command_palette');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (task: TaskSearchResult) => {
      if (!wsId) throw new Error('Workspace is required');
      await updateWorkspaceTask(wsId, task.id, { completed: !task.completed });
      return task;
    },
    onSuccess: async (task) => {
      toast.success(
        task.completed
          ? t('task_actions.reopened')
          : t('task_actions.completed')
      );
      await queryClient.invalidateQueries({
        queryKey: commandTaskQueryKey(wsId),
      });
    },
    onError: () => toast.error(t('task_actions.update_failed')),
  });
}
