'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Play, Square } from '@tuturuuu/icons';
import type { SessionWithRelations } from '@tuturuuu/types';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  getRunningTaskTimeTrackingSession,
  runningTimeSessionQueryKey,
  startTaskTimeTrackingSession,
  stopTaskTimeTrackingSession,
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
      queryClient.setQueriesData<SessionWithRelations>(
        { queryKey: ['running-time-session', 'user'] },
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

  const stopTimerMutation = useMutation({
    mutationFn: () =>
      stopTaskTimeTrackingSession(workspaceId, runningSession!.id),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: runningTimeSessionQueryKey(workspaceId),
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(runningTimeSessionQueryKey(workspaceId), null);
      queryClient.setQueriesData(
        { queryKey: ['running-time-session', 'user'] },
        null
      );
      void queryClient.invalidateQueries({
        queryKey: ['time-tracking-sessions', workspaceId],
      });
      toast.success(t('timer_stopped'), {
        description: t('timer_stopped_for', { name: taskName }),
      });
      onStarted?.();
    },
    onError: (error) => {
      toast.error(t('failed_to_stop_timer'), {
        description:
          error instanceof Error ? error.message : t('please_try_again_later'),
      });
    },
  });

  const isPending = startTimerMutation.isPending || stopTimerMutation.isPending;
  const label = stopTimerMutation.isPending
    ? t('stopping_timer')
    : startTimerMutation.isPending
      ? t('starting_timer')
      : isTrackingThisTask
        ? t('stop_tracking_time')
        : isSwitchingTasks
          ? t('switch_tracking_to_task')
          : t('start_tracking_time');

  return (
    <DropdownMenuItem
      className="cursor-pointer gap-2"
      disabled={disabled || isPending}
      onSelect={(event) => {
        event.preventDefault();
        if (isTrackingThisTask) {
          stopTimerMutation.mutate();
        } else {
          startTimerMutation.mutate();
        }
      }}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-dynamic-blue" />
      ) : isTrackingThisTask ? (
        <Square className="h-4 w-4 text-dynamic-red" />
      ) : (
        <Play className="h-4 w-4 text-dynamic-blue" />
      )}
      <span>{label}</span>
    </DropdownMenuItem>
  );
}
