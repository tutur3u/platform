'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, Play } from '@tuturuuu/icons';
import type { SessionWithRelations } from '@tuturuuu/types';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  getRunningTaskTimeTrackingSession,
  startTaskTimeTrackingSession,
} from './task-time-tracking-api';

interface TaskTimerMenuItemProps {
  taskId: string;
  taskName: string;
  taskDescription?: string | null;
  workspaceId: string;
  disabled?: boolean;
  enabled?: boolean;
  onStarted?: () => void;
}

export const runningTimeSessionQueryKey = (workspaceId: string) =>
  ['running-time-session', workspaceId] as const;

export function TaskTimerMenuItem({
  taskId,
  taskName,
  taskDescription,
  workspaceId,
  disabled = false,
  enabled = true,
  onStarted,
}: TaskTimerMenuItemProps) {
  const t = useTranslations('common');
  const queryClient = useQueryClient();
  const runningSessionQuery = useQuery({
    queryKey: runningTimeSessionQueryKey(workspaceId),
    queryFn: () => getRunningTaskTimeTrackingSession(workspaceId),
    enabled,
    retry: false,
    staleTime: 10_000,
  });
  const runningSession = runningSessionQuery.data;
  const isTrackingThisTask = runningSession?.task_id === taskId;
  const isSwitchingTasks = Boolean(
    runningSession?.task_id && !isTrackingThisTask
  );

  const startTimerMutation = useMutation({
    mutationFn: () =>
      startTaskTimeTrackingSession(workspaceId, {
        taskId,
        taskName,
        description: taskDescription,
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: runningTimeSessionQueryKey(workspaceId),
      });
    },
    onSuccess: (session) => {
      queryClient.setQueryData<SessionWithRelations>(
        runningTimeSessionQueryKey(workspaceId),
        session
      );
      void queryClient.invalidateQueries({
        queryKey: ['time-tracking-sessions', workspaceId],
      });
      toast.success(t('timer_started'), {
        description: isSwitchingTasks
          ? t('timer_switched_to', { name: taskName })
          : t('timer_started_for', { name: taskName }),
      });
      onStarted?.();
    },
    onError: (error) => {
      toast.error(t('failed_to_start_timer'), {
        description:
          error instanceof Error ? error.message : t('please_try_again_later'),
      });
    },
  });

  const isStarting = startTimerMutation.isPending;
  const label = isStarting
    ? t('starting_timer')
    : isTrackingThisTask
      ? t('tracking_this_task')
      : isSwitchingTasks
        ? t('switch_tracking_to_task')
        : t('start_tracking_time');
  const description = isTrackingThisTask
    ? t('timer_is_running')
    : isSwitchingTasks
      ? t('current_timer_will_stop')
      : t('timer_starts_immediately');

  return (
    <DropdownMenuItem
      className={cn(
        'min-h-12 cursor-pointer items-start gap-3 py-2.5',
        isTrackingThisTask && 'bg-dynamic-green/10 focus:bg-dynamic-green/15'
      )}
      disabled={disabled || isStarting || isTrackingThisTask}
      onSelect={(event) => {
        event.preventDefault();
        startTimerMutation.mutate();
      }}
    >
      <span
        className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
          isTrackingThisTask
            ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
            : 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
        )}
      >
        {isStarting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isTrackingThisTask ? (
          <Clock className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-sm leading-5">{label}</span>
        <span className="block whitespace-normal text-muted-foreground text-xs leading-4">
          {description}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
