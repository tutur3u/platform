'use client';

import { AlertCircle, ChevronRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { DayCard, DayCardHeader, DayRowLink } from './day-overview-shell';
import type { DayOverview, DayTaskRow } from './parse-day-overview';

/** Overdue rows shown before "See all"; the card stays scannable at 30+. */
export const OVERDUE_PREVIEW_LIMIT = 4;

const PRIORITY_TONE: Record<NonNullable<DayTaskRow['priority']>, string> = {
  critical: 'bg-dynamic-red/15 text-dynamic-red',
  high: 'bg-dynamic-orange/15 text-dynamic-orange',
  normal: 'bg-dynamic-gray/15 text-dynamic-gray',
  low: 'bg-dynamic-gray/15 text-dynamic-gray',
};

/** Whole days between the task's local due date and the overview date. */
export function daysOverdue(dueDate: string, date: string) {
  const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
  const day = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(day)) return null;
  return Math.max(0, Math.round((day - due) / 86_400_000));
}

function TaskRow({
  task,
  date,
  overdue,
}: {
  task: DayTaskRow;
  date: string;
  overdue: boolean;
}) {
  const t = useTranslations('dashboard.mira_chat.day_overview');
  const days = overdue ? daysOverdue(task.dueDate, date) : null;
  return (
    <DayRowLink href={task.href} label={t('open_task', { name: task.name })}>
      <span
        className="size-5 shrink-0 rounded-full border-2 border-input"
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate font-semibold">{task.name}</span>
      {task.priority && task.priority !== 'normal' && (
        <span
          className={cn(
            'hidden h-5.5 shrink-0 items-center rounded-full px-2 font-bold text-xs sm:inline-flex',
            PRIORITY_TONE[task.priority]
          )}
        >
          {t(`priority_${task.priority}`)}
        </span>
      )}
      {days !== null && days > 0 && (
        <span className="hidden shrink-0 font-mono text-dynamic-red text-xs sm:inline">
          {t('overdue_days', { count: days })}
        </span>
      )}
    </DayRowLink>
  );
}

export function DayOverviewTasksCard({ day }: { day: DayOverview }) {
  const t = useTranslations('dashboard.mira_chat.day_overview');
  const preview = day.overdue.slice(0, OVERDUE_PREVIEW_LIMIT);
  const nothing = day.dueToday.length === 0 && day.overdue.length === 0;

  return (
    <DayCard>
      <DayCardHeader
        icon={<AlertCircle className="size-4" />}
        tone={day.overdueCount > 0 ? 'red' : 'blue'}
        title={
          day.overdueCount > 0 ? t('tasks_title_overdue') : t('tasks_title')
        }
        subtitle={t('tasks_subtitle', {
          due: day.dueTodayCount,
          overdue: day.overdueCount,
        })}
        href={day.tasksHref}
        linkLabel={t('open_tasks')}
      />
      {day.tasksError ? (
        <p className="text-muted-foreground text-sm">
          {t('tasks_unavailable')}
        </p>
      ) : nothing ? (
        <p className="text-muted-foreground text-sm">{t('no_tasks')}</p>
      ) : (
        <>
          {day.dueToday.length > 0 && (
            <>
              <p className="mt-1 mb-1 font-mono font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                {t('due_today')}
              </p>
              <ul className="flex flex-col">
                {day.dueToday.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    date={day.date}
                    overdue={false}
                  />
                ))}
              </ul>
            </>
          )}
          {preview.length > 0 && (
            <>
              {day.dueToday.length > 0 && (
                <p className="mt-3 mb-1 font-mono font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
                  {t('overdue')}
                </p>
              )}
              <ul className="flex flex-col">
                {preview.map((task) => (
                  <TaskRow key={task.id} task={task} date={day.date} overdue />
                ))}
              </ul>
            </>
          )}
          {day.overdueCount > preview.length && day.tasksHref && (
            <a
              href={day.tasksHref}
              className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-secondary px-3 py-2.5 font-bold text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            >
              {t('see_all_overdue', { count: day.overdueCount })}
              <ChevronRight className="size-4" />
            </a>
          )}
        </>
      )}
    </DayCard>
  );
}
