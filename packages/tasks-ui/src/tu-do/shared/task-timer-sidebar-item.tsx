'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Square, Timer } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { dispatchRequestOpenTask } from '@tuturuuu/ui/lib/task-open-events';
import { getTasksAppUrl } from '@tuturuuu/ui/lib/tasks-app-url';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { type MouseEvent, useState } from 'react';
import {
  getRunningTaskTimeTrackingSession,
  runningUserTimeSessionQueryKey,
} from './task-time-tracking-api';
import { useStopTaskTimer } from './use-stop-task-timer';

interface TaskTimerSidebarItemProps {
  isCollapsed: boolean;
  workspaceId: string;
  workspacePath?: string;
}

export function TaskTimerSidebarItem({
  isCollapsed,
  workspaceId,
  workspacePath = workspaceId,
}: TaskTimerSidebarItemProps) {
  const t = useTranslations('common');
  const [actionsOpen, setActionsOpen] = useState(false);
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
  const stopMutation = useStopTaskTimer({
    session,
    taskName: taskName ?? '',
    workspaceId: session?.ws_id ?? workspaceId,
  });

  if (!session || !taskName) return null;

  const taskId = session.task_id ?? session.task?.id;
  const taskSummary = session.task as
    | (NonNullable<typeof session.task> & { board_id?: string })
    | null
    | undefined;
  const taskWorkspacePath =
    session.ws_id === workspaceId ? workspacePath : session.ws_id;
  const taskDetailsPath = taskSummary?.board_id
    ? `/${encodeURIComponent(taskWorkspacePath)}/boards/${encodeURIComponent(taskSummary.board_id)}?task=${encodeURIComponent(taskId ?? '')}`
    : `/${encodeURIComponent(taskWorkspacePath)}?task=${encodeURIComponent(taskId ?? '')}`;
  const taskDetailsHref = getTasksAppUrl(taskDetailsPath);

  const handleTaskDetailsClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!taskId) return;

    const { handled } = dispatchRequestOpenTask({
      taskId,
    });
    if (handled) {
      event.preventDefault();
      setActionsOpen(false);
    }
  };

  const actionsDialog = (
    <Dialog open={actionsOpen} onOpenChange={setActionsOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate">
            {t('tracking_task_named', { name: taskName })}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {taskId ? (
            <Button asChild className="justify-start" variant="outline">
              <a href={taskDetailsHref} onClick={handleTaskDetailsClick}>
                <Timer className="h-4 w-4 text-dynamic-green" />
                {t('view_task')}
              </a>
            </Button>
          ) : null}
          <Button
            className="justify-start"
            disabled={stopMutation.isPending}
            onClick={() => stopMutation.mutate()}
            variant="outline"
          >
            {stopMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4 text-dynamic-red" />
            )}
            {t('stop_tracking_time')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (isCollapsed) {
    return (
      <div className="mt-auto w-full border-t p-2">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('tracking_task_named', { name: taskName })}
                className="h-9 w-full justify-center text-dynamic-green"
                onClick={() => setActionsOpen(true)}
                size="icon"
                variant="ghost"
              >
                <Timer className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{taskName}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {actionsDialog}
      </div>
    );
  }

  return (
    <div className="mt-auto border-t p-2">
      <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5">
        <Timer className="h-4 w-4 shrink-0 text-dynamic-green" />
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={t('tracking_task_named', { name: taskName })}
                className="min-w-0 flex-1 truncate rounded-sm text-left font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setActionsOpen(true)}
                type="button"
              >
                {taskName}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{taskName}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
      {actionsDialog}
    </div>
  );
}
