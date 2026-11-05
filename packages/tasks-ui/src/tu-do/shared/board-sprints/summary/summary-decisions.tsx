'use client';

import type {
  BoardSprintEndDecision,
  BoardSprintTask,
} from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { cn } from '@tuturuuu/utils/format';
import { isTaskOverdueByOwnDate } from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import { ToneButton } from '../../board-header/tone-button';
import { PlanTaskTitle } from '../plan/plan-parts';
import type { SprintEndDecisions } from './sprint-summary-model';

const OPTION_CLASS =
  'inline-flex h-7 items-center rounded-md border px-2 font-medium text-xs transition-colors';

/** Each open task of the ending sprint gets carried with its owner or sent to the backlog. */
export function SummaryDecisions({
  decisions,
  listsById,
  nextSprintName,
  onChange,
  unfinished,
}: {
  decisions: SprintEndDecisions;
  listsById: Map<string, TaskList>;
  nextSprintName: string;
  onChange: (decisions: SprintEndDecisions) => void;
  unfinished: { entry: BoardSprintTask; task: Task }[];
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const locale = useLocale();
  const setAll = (decision: BoardSprintEndDecision) =>
    onChange(
      Object.fromEntries(unfinished.map(({ task }) => [task.id, decision]))
    );

  const note = (entry: BoardSprintTask, task: Task) => {
    const parts = [
      listsById.get(task.list_id)?.name,
      task.estimation_points == null
        ? t('unknown_estimate')
        : t('points', { count: task.estimation_points }),
      task.assignees?.length
        ? task.assignees.map((assignee) => assignee.display_name).join(', ')
        : t('unassigned'),
    ];
    const overdue = isTaskOverdueByOwnDate(task);
    if (task.end_date) {
      parts.push(
        overdue
          ? t('overdue')
          : t('due_on', {
              date: new Intl.DateTimeFormat(locale, {
                day: 'numeric',
                month: 'short',
              }).format(new Date(task.end_date)),
            })
      );
    }
    const carriedTwice = entry.carry_count >= 2;
    if (carriedTwice) parts.push(t('carried_twice'));
    return {
      text: parts.filter(Boolean).join(' · '),
      warn: overdue || carriedTwice,
    };
  };

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium text-sm">{t('unfinished')}</h3>
        <span className="rounded-md bg-muted px-1.5 text-muted-foreground text-xs">
          {unfinished.length}
        </span>
        <span className="flex-1" />
        {unfinished.length ? (
          <>
            <ToneButton
              className="h-7"
              onClick={() => setAll('carry')}
              tone="blue"
            >
              {t('carry_all', { name: nextSprintName })}
            </ToneButton>
            <button
              className={cn(OPTION_CLASS, 'hover:bg-muted')}
              onClick={() => setAll('backlog')}
              type="button"
            >
              {t('all_to_backlog')}
            </button>
          </>
        ) : null}
      </div>
      {unfinished.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('all_done')}</p>
      ) : null}
      {unfinished.map(({ entry, task }) => {
        const info = note(entry, task);
        const current = decisions[task.id];
        return (
          <div
            className="flex flex-col gap-1 border-t pt-2"
            data-decision-task-id={task.id}
            key={task.id}
          >
            <PlanTaskTitle className="text-sm" task={task} />
            <span
              className={cn(
                'text-muted-foreground text-xs',
                info.warn && 'text-dynamic-orange'
              )}
            >
              {info.text}
            </span>
            <fieldset
              aria-label={t('decision_label', { name: task.name })}
              className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0"
            >
              <button
                aria-pressed={current === 'carry'}
                className={cn(
                  OPTION_CLASS,
                  current === 'carry'
                    ? 'border-transparent bg-dynamic-blue/85 text-background'
                    : 'border-dynamic-blue/30 text-dynamic-blue hover:bg-dynamic-blue/10'
                )}
                onClick={() => onChange({ ...decisions, [task.id]: 'carry' })}
                type="button"
              >
                {t('carry_to', { name: nextSprintName })}
              </button>
              <button
                aria-pressed={current === 'backlog'}
                className={cn(
                  OPTION_CLASS,
                  current === 'backlog'
                    ? 'border-transparent bg-foreground/80 text-background'
                    : 'text-muted-foreground hover:bg-muted'
                )}
                onClick={() => onChange({ ...decisions, [task.id]: 'backlog' })}
                type="button"
              >
                {t('to_backlog')}
              </button>
            </fieldset>
          </div>
        );
      })}
    </section>
  );
}
