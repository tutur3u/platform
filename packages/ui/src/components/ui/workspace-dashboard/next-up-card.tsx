'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CircleAlert,
  Clock,
  ListTodo,
} from '@tuturuuu/icons/lucide';
import { useLocale, useTranslations } from 'next-intl';
import { DashboardCard } from './dashboard-card';
import { NextCell } from './next-up-cell';
import {
  eventHref,
  minutesUntil,
  pickNextEvent,
  pickNextTask,
  splitDuration,
} from './dashboard-model';
import {
  dashboardAgendaQuery,
  dashboardTasksQuery,
  dashboardTimeStatsQuery,
} from './dashboard-queries';
import { formatClockTime, useNow } from './use-now';

interface NextUpCardProps {
  wsId: string;
  isPersonal: boolean;
  showEvent: boolean;
  showTask: boolean;
  showTime: boolean;
  /** Calendar app root; the next event opens there by id. */
  calendarHref: string;
}

/**
 * One glance at what is next. Reuses the agenda and task queries, so it adds
 * no requests of its own; each cell loads and fails independently.
 */
export function NextUpCard({
  wsId,
  isPersonal,
  showEvent,
  showTask,
  showTime,
  calendarHref,
}: NextUpCardProps) {
  const t = useTranslations('dashboard.overview');
  const locale = useLocale();
  const now = useNow();
  const agenda = useQuery({
    ...dashboardAgendaQuery(wsId, now),
    enabled: showEvent,
  });
  const tasks = useQuery({
    ...dashboardTasksQuery(wsId, isPersonal),
    enabled: showTask,
  });
  const time = useQuery({
    ...dashboardTimeStatsQuery(wsId),
    enabled: showTime,
  });
  const event = agenda.data ? pickNextEvent(agenda.data, now) : null;
  const task = tasks.data ? pickNextTask(tasks.data, now) : null;

  return (
    <DashboardCard id="next" title={t('next_up')} hideTitle>
      <div className="grid min-w-0 grid-cols-1 @min-[32rem]/card:auto-cols-fr @min-[32rem]/card:grid-flow-col">
        {showEvent ? (
          <NextCell
            icon={<CalendarDays aria-hidden className="size-3.5" />}
            label={t('next_event')}
            status={agenda.status}
            onRetry={() => void agenda.refetch()}
            title={event?.title || (event ? t('untitled_event') : null)}
            href={event ? eventHref(calendarHref, event.id) : undefined}
            detail={
              event
                ? new Date(event.start_at) <= now
                  ? t('happening_now')
                  : `${formatClockTime(locale, event.start_at)} · ${t('in_minutes', { minutes: minutesUntil(event.start_at, now) })}`
                : t('nothing_scheduled')
            }
          />
        ) : null}
        {showTask ? (
          <NextCell
            icon={
              task?.group === 'overdue' ? (
                <CircleAlert aria-hidden className="size-3.5" />
              ) : (
                <ListTodo aria-hidden className="size-3.5" />
              )
            }
            label={task?.group === 'overdue' ? t('group_overdue') : t('next_task')}
            tone={task?.group === 'overdue' ? 'danger' : 'default'}
            status={tasks.status}
            onRetry={() => void tasks.refetch()}
            title={task?.name ?? null}
            href={task?.href ?? undefined}
            detail={
              task
                ? [
                    task.context,
                    task.daysLate > 0
                      ? t('days_late', { count: task.daysLate })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : t('no_open_tasks')
            }
          />
        ) : null}
        {showTime ? (
          <NextCell
            icon={<Clock aria-hidden className="size-3.5" />}
            label={t('tracked_today')}
            status={time.status}
            onRetry={() => void time.refetch()}
            title={
              time.data
                ? t('duration', splitDuration(time.data.todayTime))
                : null
            }
            detail={
              time.data
                ? t('tracked_week_value', {
                    value: t('duration', splitDuration(time.data.weekTime)),
                  })
                : ''
            }
          />
        ) : null}
      </div>
    </DashboardCard>
  );
}
