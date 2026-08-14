'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Square, Timer } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import {
  getRunningTaskTimeTrackingSession,
  runningTimeSessionQueryKey,
  runningUserTimeSessionQueryKey,
  stopTaskTimeTrackingSession,
} from './task-time-tracking-api';

interface TaskTimerSidebarItemProps {
  isCollapsed: boolean;
  workspaceId: string;
}

export function TaskTimerSidebarItem({
  isCollapsed,
  workspaceId,
}: TaskTimerSidebarItemProps) {
  const t = useTranslations('common');
  const queryClient = useQueryClient();
  const runningQuery = useQuery({
    queryKey: runningUserTimeSessionQueryKey(workspaceId),
    queryFn: () =>
      getRunningTaskTimeTrackingSession(workspaceId, { scope: 'user' }),
    refetchInterval: 30_000,
    retry: false,
    staleTime: 10_000,
  });
  const session = runningQuery.data;
  const taskName = session?.task?.name ?? session?.title;
  const stopMutation = useMutation({
    mutationFn: () => stopTaskTimeTrackingSession(session!.ws_id, session!.id),
    onSuccess: () => {
      queryClient.setQueryData(
        runningUserTimeSessionQueryKey(workspaceId),
        null
      );
      queryClient.setQueryData(
        runningTimeSessionQueryKey(session!.ws_id),
        null
      );
      void queryClient.invalidateQueries({
        queryKey: ['time-tracking-sessions', session!.ws_id],
      });
      toast.success(t('timer_stopped'), {
        description: t('timer_stopped_for', { name: taskName ?? '' }),
      });
    },
    onError: (error) => {
      toast.error(t('failed_to_stop_timer'), {
        description:
          error instanceof Error ? error.message : t('please_try_again_later'),
      });
    },
  });

  if (!session || !taskName) return null;

  if (isCollapsed) {
    return (
      <div className="mt-auto border-t p-2">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('tracking_task_named', { name: taskName })}
                className="h-9 w-9 text-dynamic-green"
                size="icon"
                variant="ghost"
              >
                <Timer className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{taskName}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="mt-auto border-t p-2">
      <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
        <Timer className="h-4 w-4 shrink-0 text-dynamic-green" />
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {taskName}
        </span>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('stop_tracking_time')}
                className="h-7 w-7 shrink-0 text-dynamic-red"
                disabled={stopMutation.isPending}
                onClick={() => stopMutation.mutate()}
                size="icon"
                variant="ghost"
              >
                {stopMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t('stop_tracking_time')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
