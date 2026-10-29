'use client';

import { ArrowRight, Flag } from '@tuturuuu/icons';
import type {
  BoardSprint,
  BoardSprintGoalResult,
  BoardSprintReport,
} from '@tuturuuu/internal-api/task-sprints';
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
import { cn } from '@tuturuuu/utils/format';
import {
  formatSprintDateRange,
  getDaysUntilSprintEnd,
} from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useBoardMembers, useSprintTasks } from '../plan/use-sprint-plan-data';
import { useBoardSprintMutations } from '../use-board-sprints';
import {
  buildLiveSprintSummary,
  countMissingDecisions,
  getUnfinishedSprintTasks,
  type SprintEndDecisions,
  summaryFromReport,
} from './sprint-summary-model';
import { SummaryDecisions } from './summary-decisions';
import { SummaryPeople, SummaryTiles } from './summary-stats';

const RESULTS = ['met', 'partly', 'missed'] as const;

const RESULT_CLASSES: Record<
  (typeof RESULTS)[number],
  { on: string; off: string }
> = {
  met: {
    on: 'border-transparent bg-dynamic-green/85 text-background',
    off: 'border-dynamic-green/30 text-dynamic-green hover:bg-dynamic-green/10',
  },
  partly: {
    on: 'border-transparent bg-dynamic-orange/85 text-background',
    off: 'border-dynamic-orange/30 text-dynamic-orange hover:bg-dynamic-orange/10',
  },
  missed: {
    on: 'border-transparent bg-dynamic-red/85 text-background',
    off: 'border-dynamic-red/30 text-dynamic-red hover:bg-dynamic-red/10',
  },
};

export interface SprintSummaryTarget {
  mode: 'live' | 'report';
  sprintId: string;
}

/**
 * The end-of-sprint summary: live for the running sprint, where every open
 * task gets a decision before ending, and as a stored report once it ended.
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
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
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
  const [decisions, setDecisions] = useState<SprintEndDecisions>({});
  const [goalResult, setGoalResult] = useState<BoardSprintGoalResult | null>(
    sprint.goal_result
  );
  const tasksQuery = useSprintTasks({ boardId, enabled: live, wsId });
  const tasks = tasksQuery.data ?? [];
  // Ending without the full task list would send no decisions and carry
  // everything, so the live summary waits for it.
  const tasksReady = !live || tasksQuery.isSuccess;
  const { data: members = [] } = useBoardMembers({
    boardId,
    enabled: true,
    wsId,
  });
  const { end } = useBoardSprintMutations({ boardId, wsId });

  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );
  const listsById = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists]
  );
  const report = sprint.report;
  const numbers =
    live || !report
      ? buildLiveSprintSummary(sprint, tasksById)
      : summaryFromReport(report);
  const unfinished = live ? getUnfinishedSprintTasks(sprint, tasksById) : [];
  const missing = countMissingDecisions(
    unfinished.map(({ task }) => task.id),
    decisions
  );
  const nextName = nextSprint?.name ?? t('next_sprint');
  const daysLeft = getDaysUntilSprintEnd(sprint);
  const shownResult = live ? goalResult : (report?.goal_result ?? null);

  const finish = () =>
    end.mutate(
      { decisions, goalResult, sprintId: sprint.id },
      {
        onSuccess: (data) => {
          const { report: ended } = data as {
            report: Pick<BoardSprintReport, 'backlog_tasks' | 'carried_tasks'>;
          };
          toast.success(
            t('ended_toast', {
              backlog: ended.backlog_tasks,
              carried: ended.carried_tasks,
              name: sprint.name,
              next: nextName,
            })
          );
          onEnded?.();
          onClose();
        },
        onError: () => toast.error(t('end_failed')),
      }
    );

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

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dynamic-green/30 bg-dynamic-green/5 p-3 text-sm">
        <Flag className="size-4 text-dynamic-green" />
        <span className="min-w-0 flex-1">
          <span className="text-muted-foreground">{t('goal_label')} </span>
          {sprint.goal || report?.goal || t('no_goal')}
        </span>
        <fieldset
          aria-label={t('goal_result_label')}
          className="m-0 flex min-w-0 gap-1 border-0 p-0"
        >
          {RESULTS.map((key) => (
            <button
              aria-pressed={shownResult === key}
              className={cn(
                'inline-flex h-7 items-center rounded-md border px-2 font-medium text-xs transition-colors disabled:cursor-default',
                RESULT_CLASSES[key][shownResult === key ? 'on' : 'off']
              )}
              disabled={!live || !canEnd}
              key={key}
              onClick={() => setGoalResult(goalResult === key ? null : key)}
              type="button"
            >
              {t(`goal_${key}`)}
            </button>
          ))}
        </fieldset>
      </div>

      <SummaryTiles numbers={numbers} />

      <div className="grid gap-3 md:grid-cols-2">
        <SummaryPeople members={members} numbers={numbers} />
        {live && !tasksReady ? (
          <section className="flex flex-col items-start gap-2 rounded-lg border p-3 text-muted-foreground text-sm">
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
          <SummaryDecisions
            decisions={decisions}
            listsById={listsById}
            nextSprintName={nextName}
            onChange={setDecisions}
            unfinished={unfinished}
          />
        ) : (
          <section className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <h3 className="font-medium">{t('unfinished_work')}</h3>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('carried_next')}</span>
              <span className="font-medium">{report?.carried_tasks ?? 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('sent_backlog')}</span>
              <span className="font-medium">{report?.backlog_tasks ?? 0}</span>
            </div>
          </section>
        )}
      </div>

      <DialogFooter className="items-center gap-2 sm:justify-between">
        <span className="text-muted-foreground text-sm">
          {live
            ? !tasksReady
              ? ''
              : missing
                ? t('needs_decision', { count: missing })
                : t('ready_to_end')
            : shownResult
              ? t(`goal_status_${shownResult}`)
              : ''}
        </span>
        <div className="flex gap-2">
          {live && canEnd ? (
            <>
              <Button onClick={onClose} variant="outline">
                {t('not_yet')}
              </Button>
              <Button
                disabled={!tasksReady || missing > 0 || end.isPending}
                onClick={finish}
              >
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
