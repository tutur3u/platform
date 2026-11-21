import type { WorkspaceTaskRecurrenceSchedule } from '@tuturuuu/internal-api/task-recurrence';
import type { CalendarWeekday } from '@tuturuuu/types/primitives/calendar-recurrence';
import { summarizeTaskRecurrence } from '@tuturuuu/utils/task-recurrence';

/** A translator scoped to `ws-task-boards.recurrence`. */
export type TaskRecurrenceTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export const TASK_RECURRENCE_WEEK: readonly CalendarWeekday[] = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
];

function format(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  value: Date
) {
  try {
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: 'UTC',
    }).format(value);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: 'UTC',
    }).format(value);
  }
}

/** 2024-01-01 is a Monday, so the offset of a weekday names it. */
export function formatTaskRecurrenceWeekday(
  day: CalendarWeekday,
  locale: string,
  width: 'narrow' | 'short' | 'long' = 'short'
) {
  const offset = TASK_RECURRENCE_WEEK.indexOf(day);
  return format(
    locale,
    { weekday: width },
    new Date(Date.UTC(2024, 0, 1 + offset))
  );
}

/** A local `YYYY-MM-DD` date such as "Fri, Nov 21". */
export function formatTaskRecurrenceDate(
  date: string,
  locale: string,
  withYear = false
) {
  const [year, month, day] = date.split('-').map(Number);
  return format(
    locale,
    {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    },
    new Date(Date.UTC(year!, month! - 1, day!))
  );
}

/** "Weekly on Fri", "Every 2 months on day 31 · 5 times". */
export function formatTaskRecurrenceSummary(
  schedule: WorkspaceTaskRecurrenceSchedule,
  t: TaskRecurrenceTranslator,
  locale: string
) {
  let summary: ReturnType<typeof summarizeTaskRecurrence>;
  try {
    summary = summarizeTaskRecurrence(schedule, { nextCount: 1 });
  } catch {
    return t('repeat');
  }
  const weekdays = summary.weekdays
    .map((day) => formatTaskRecurrenceWeekday(day, locale))
    .join(', ');
  switch (summary.preset) {
    case 'daily':
      return t('summary_daily');
    case 'weekdays':
      return t('summary_weekdays');
    case 'weekly':
      return t('summary_weekly', { weekdays });
    case 'monthly':
      return t('summary_monthly', { day: summary.monthDay ?? 1 });
  }
  const parts = [t(`every_${summary.frequency}`, { count: summary.interval })];
  if (summary.frequency === 'weekly' && weekdays)
    parts.push(t('on_weekdays', { weekdays }));
  if (summary.frequency === 'monthly' && summary.monthDay)
    parts.push(t('on_month_day', { day: summary.monthDay }));
  if (summary.frequency === 'yearly' && summary.monthDay && summary.month) {
    const date = format(
      locale,
      { month: 'short', day: 'numeric' },
      new Date(Date.UTC(2024, summary.month - 1, summary.monthDay))
    );
    parts.push(t('on_date', { date }));
  }
  const head = parts.join(' ');
  if (summary.end.type === 'count')
    return `${head} · ${t('ends_count', { count: summary.end.count })}`;
  if (summary.end.type === 'until')
    return `${head} · ${t('ends_until', {
      date: formatTaskRecurrenceDate(summary.end.date, locale, true),
    })}`;
  return head;
}
