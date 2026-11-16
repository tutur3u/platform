'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { goalPercent, pickOverallGoal, splitDuration } from './dashboard-model';
import {
  dashboardTimeGoalsQuery,
  dashboardTimeWeekQuery,
} from './dashboard-queries';

/**
 * Daily goal progress from the viewer's own active overall goal. With no
 * goal set it says so and links to Track, where goals are configured.
 */
export function TimeGoal({
  wsId,
  todaySeconds,
  trackHref,
}: {
  wsId: string;
  todaySeconds: number;
  trackHref: string;
}) {
  const t = useTranslations('dashboard.overview');
  const goals = useQuery(dashboardTimeGoalsQuery(wsId));

  if (goals.status === 'pending') {
    return <span aria-hidden className="h-1.5 rounded-full bg-muted motion-safe:animate-pulse" />;
  }
  if (goals.status === 'error') {
    return <p className="text-muted-foreground text-xs">{t('goal_error')}</p>;
  }

  const goal = pickOverallGoal(goals.data);
  if (!goal) {
    return (
      <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
        <span>{t('goal_unset')}</span>
        <a
          href={trackHref}
          className="underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t('goal_set_up')}
        </a>
      </p>
    );
  }

  const percent = goalPercent(todaySeconds, goal.daily_goal_minutes);
  const target = t('duration', splitDuration(goal.daily_goal_minutes * 60));
  return (
    <div className="grid min-w-0 gap-1">
      <div
        role="progressbar"
        aria-label={t('goal_label', { target })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-muted-foreground text-xs">
        {t('goal_progress', {
          tracked: t('duration', splitDuration(todaySeconds)),
          target,
        })}
      </span>
    </div>
  );
}

/** Seven small bars of tracked time, today last; real totals only. */
export function TimeWeekBars({ wsId, now }: { wsId: string; now: Date }) {
  const t = useTranslations('dashboard.overview');
  const locale = useLocale();
  const week = useQuery(dashboardTimeWeekQuery(wsId, now));

  if (week.status !== 'success') {
    return week.status === 'error' ? (
      <p className="text-muted-foreground text-xs">{t('week_error')}</p>
    ) : (
      <span aria-hidden className="h-14 rounded bg-muted motion-safe:animate-pulse" />
    );
  }

  const max = Math.max(...week.data.map((day) => day.seconds), 1);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  const longDay = new Intl.DateTimeFormat(locale, { weekday: 'long' });

  return (
    <ul aria-label={t('week_label')} className="grid h-20 grid-cols-7 items-end gap-1.5">
      {week.data.map((day, index) => {
        const isToday = index === week.data.length - 1;
        return (
          <li
            key={day.key}
            className="flex h-full min-w-0 flex-col items-center justify-end gap-1"
          >
            <span className="sr-only">
              {longDay.format(day.date)}: {t('duration', splitDuration(day.seconds))}
            </span>
            <span aria-hidden className="flex min-h-0 w-full flex-1 items-end">
              <span
                className={cn(
                  'block w-full rounded-sm',
                  isToday ? 'bg-foreground' : 'bg-muted-foreground/40'
                )}
                style={{
                  height: `${Math.max(2, Math.round((day.seconds / max) * 100))}%`,
                }}
              />
            </span>
            <span aria-hidden className="text-[10px] text-muted-foreground leading-none">
              {weekday.format(day.date)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
