import { resolveTaskTimezone } from '@tuturuuu/utils/task-date-timezone';
import {
  calendarDayKey,
  calendarQueryRange,
  calendarToday,
} from '../lib/calendar-day';

/** Range identity uses date-only carriers and the zone that resolves boundaries. */
export function calendarRangeCacheKey(dates: Date[], timezone?: string) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  return first && last
    ? `${resolveTaskTimezone(timezone ?? 'auto')}:${calendarDayKey(first)}-${calendarDayKey(last)}`
    : '';
}

export function calendarRangeIncludesToday(
  dates: Date[],
  timezone?: string,
  now?: Date
) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return false;
  const today = calendarDayKey(calendarToday(timezone, now));
  return calendarDayKey(first) <= today && calendarDayKey(last) >= today;
}

export function calendarEventInQueryRange(
  event: { start_at?: string; end_at?: string },
  dates: Date[],
  timezone?: string
) {
  if (!dates.length || (!event.start_at && !event.end_at)) return true;
  const { start, end } = calendarQueryRange(dates, timezone);
  const startAt = event.start_at ? new Date(event.start_at).getTime() : NaN;
  const endAt = event.end_at ? new Date(event.end_at).getTime() : startAt;
  if (Number.isNaN(startAt) || Number.isNaN(endAt)) return true;
  return startAt < end.getTime() && endAt >= start.getTime();
}
