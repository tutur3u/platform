'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  completeCurrentUserTask,
  TaskCompletionUnavailableError,
} from '@tuturuuu/internal-api/tasks';
import type { TaskWithRelations } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { TaskDashboardData } from './dashboard-model';
import { dashboardTasksQuery } from './dashboard-queries';

function withoutTask(data: TaskDashboardData, taskId: string) {
  const keep = (tasks: TaskWithRelations[]) =>
    tasks.filter((task) => task.id !== taskId);
  const overdue = keep(data.overdue);
  const today = keep(data.today);
  const upcoming = keep(data.upcoming);
  return {
    overdue,
    today,
    upcoming,
    totalActiveTasks: overdue.length + today.length + upcoming.length,
  };
}

/**
 * Completes a task from the dashboard with the My Tasks rules
 * (`completeCurrentUserTask`). The row leaves the list at once and comes
 * back if the write fails.
 */
export function useCompleteDashboardTask(wsId: string, isPersonal: boolean) {
  const t = useTranslations('dashboard.overview');
  const queryClient = useQueryClient();
  const { queryKey } = dashboardTasksQuery(wsId, isPersonal);

  return useMutation({
    mutationFn: (task: TaskWithRelations) => completeCurrentUserTask(task),
    onMutate: async (task) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TaskDashboardData>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, withoutTask(previous, task.id));
      }
      return { previous };
    },
    onError: (error, _task, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      const reason =
        error instanceof TaskCompletionUnavailableError ? error.reason : null;
      toast.error(
        reason === 'done_list_missing'
          ? t('task_done_list_missing')
          : reason === 'not_on_board'
            ? t('task_not_on_board')
            : t('complete_task_failed')
      );
    },
    onSuccess: () => toast.success(t('task_completed')),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}
