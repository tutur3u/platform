import type { Temporal } from '@js-temporal/polyfill';
import type { CalendarRecurrenceRule } from '@tuturuuu/types/primitives/calendar-recurrence';
export const CALENDAR_WEEKDAYS = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
] as const;
export function matchesCalendarRecurrenceDate(
  date: Temporal.PlainDate,
  first: Temporal.PlainDate,
  rule: CalendarRecurrenceRule
) {
  const days = first.until(date, { largestUnit: 'days' }).days;
  if (rule.frequency === 'daily') return days % rule.interval === 0;
  const day = CALENDAR_WEEKDAYS[date.dayOfWeek - 1]!;
  if (rule.frequency === 'weekly') {
    const weekStart = CALENDAR_WEEKDAYS.indexOf(rule.weekStartsOn ?? 'MO') + 1;
    const leading = (first.dayOfWeek - weekStart + 7) % 7;
    return (
      Math.floor((days + leading) / 7) % rule.interval === 0 &&
      rule.weekdays!.includes(day)
    );
  }
  const months = (date.year - first.year) * 12 + date.month - first.month;
  if (
    rule.frequency === 'monthly'
      ? months % rule.interval !== 0
      : (date.year - first.year) % rule.interval !== 0 ||
        date.month !== rule.month
  )
    return false;
  if (rule.monthDay !== undefined)
    return (
      date.day ===
      (rule.monthDayOverflow === 'last-day'
        ? Math.min(rule.monthDay, date.daysInMonth)
        : rule.monthDay)
    );
  // Graph relative patterns select the earliest matching ordinal weekday.
  const candidates = rule.weekdays!.map((weekday) => {
    const index = CALENDAR_WEEKDAYS.indexOf(weekday) + 1;
    if (rule.weekIndex === -1) {
      const last = date.with({ day: date.daysInMonth });
      return last.day - ((last.dayOfWeek - index + 7) % 7);
    }
    const start = date.with({ day: 1 });
    return 1 + ((index - start.dayOfWeek + 7) % 7) + (rule.weekIndex! - 1) * 7;
  });
  return date.day === Math.min(...candidates);
}
