'use client';

import { ArrowRight } from '@tuturuuu/icons';
import type {
  BoardSprint,
  BoardSprintReport,
} from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import {
  formatSprintDateRange,
  getDaysUntilSprintEnd,
} from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useSprintTasks } from '../plan/use-sprint-plan-data';
import { useBoardSprintMutations } from '../use-board-sprints';
import {
  buildLiveSprintSummary,
  getUnfinishedSprintTasks,
  summaryFromReport,
} from './sprint-summary-model';
import { SummaryDone, SummaryUnfinished } from './summary-stats';

const NO_TASKS: Task[] = [];

export interface SprintSummaryTarget {
  mode: 'live' | 'report';
  sprintId: string;
}

/**
 * The end-of-sprint summary: live for the running sprint, whose open tasks
 * move to the next sprint with their owners, and as a stored report once it
 * ended.
 */
export function SprintSummaryDialog({
  boardId,
  canEnd,
  lists,
  nextSprint,
  onEnded,
  onOpenChange,
  sprint,
  target,
  wsId,
}: {
  boardId: string;
  canEnd: boolean;
  lists: TaskList[];
  nextSprint: BoardSprint | null;
  onEnded?: () => void;
  onOpenChange: (open: boolean) => void;
  sprint: BoardSprint | null;
  target: SprintSummaryTarget | null;
  wsId: string;
}) {
  const open = Boolean(target && sprint);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl">
        {target && sprint ? (
          <SummaryBody
            boardId={boardId}
            canEnd={canEnd}
            key={`${target.mode}:${sprint.id}`}
            lists={lists}
            live={target.mode === 'live' && sprint.status === 'active'}
            nextSprint={nextSprint}
            onClose={() => onOpenChange(false)}
            onEnded={onEnded}
            sprint={sprint}
            wsId={wsId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SummaryBody({
  boardId,
  canEnd,
  lists,
  live,
  nextSprint,
  onClose,
  onEnded,
  sprint,
  wsId,
}: {
  boardId: string;
  canEnd: boolean;
  lists: TaskList[];
  live: boolean;
  nextSprint: BoardSprint | null;
  onClose: () => void;
  onEnded?: () => void;
  sprint: BoardSprint;
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const locale = useLocale();
  const tasksQuery = useSprintTasks({ boardId, enabled: live, wsId });
  const tasks = tasksQuery.data ?? NO_TASKS;
  // The live numbers need the sprint's tasks, so End waits for them.
  const tasksReady = !live || tasksQuery.isSuccess;
  const { end } = useBoardSprintMutations({ boardId, wsId });

  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );
  const report = sprint.report;
  const numbers =
    live || !report
      ? buildLiveSprintSummary(sprint, tasksById)
      : summaryFromReport(report);
  const unfinished = live ? getUnfinishedSprintTasks(sprint, tasksById) : [];
  const nextName = nextSprint?.name ?? t('next_sprint');
  const daysLeft = getDaysUntilSprintEnd(sprint);

  const finish = () =>
    end.mutate(sprint.id, {
      onSuccess: (data) => {
        const { report: ended } = data as {
          report: Pick<BoardSprintReport, 'backlog_tasks' | 'carried_tasks'>;
        };
        toast.success(
          t('ended_toast', {
            count: ended.carried_tasks + ended.backlog_tasks,
            name: sprint.name,
            next: nextName,
          })
        );
        onEnded?.();
        onClose();
      },
      onError: () => toast.error(t('end_failed')),
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-medium text-lg">
          {t(live ? 'summary_title' : 'report_title', { name: sprint.name })}
        </DialogTitle>
        <DialogDescription>
          {formatSprintDateRange(sprint, locale)}
          {' · '}
          {live && daysLeft !== null && daysLeft >= 0
            ? t('days_left', { count: daysLeft })
            : t('ended')}
        </DialogDescription>
      </DialogHeader>

      {tasksReady ? <SummaryDone numbers={numbers} /> : null}

      {live && !tasksReady ? (
        <section className="flex flex-col items-start gap-2 rounded-lg border p-4 text-muted-foreground text-sm">
          {tasksQuery.isError ? (
            <>
              <span>{t('tasks_failed')}</span>
              <Button
                onClick={() => void tasksQuery.refetch()}
                size="sm"
                variant="outline"
              >
                {t('retry')}
              </Button>
            </>
          ) : (
            <span>{t('loading_tasks')}</span>
          )}
        </section>
      ) : live ? (
        <SummaryUnfinished lists={lists} tasks={unfinished} />
      ) : (
        <section className="flex items-center justify-between rounded-lg border p-4 text-sm">
          <span className="text-muted-foreground">{t('carried_next')}</span>
          <span className="font-medium">
            {(report?.carried_tasks ?? 0) + (report?.backlog_tasks ?? 0)}
          </span>
        </section>
      )}

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="text-muted-foreground text-sm">
          {live && tasksReady && unfinished.length
            ? t('end_moves', { count: unfinished.length, name: nextName })
            : ''}
        </span>
        <div className="flex gap-2">
          {live && canEnd ? (
            <>
              <Button onClick={onClose} variant="outline">
                {t('not_yet')}
              </Button>
              <Button disabled={!tasksReady || end.isPending} onClick={finish}>
                {t('end_and_plan', { name: nextName })}
                <ArrowRight />
              </Button>
            </>
          ) : (
            <Button onClick={onClose} variant="outline">
              {t('close')}
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  );
}
