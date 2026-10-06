import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(timezone);
dayjs.extend(utc);

export function isAllDayEvent(
  event: Pick<CalendarEvent, 'start_at' | 'end_at'>,
  displayTimezone?: string
): boolean {
  const start =
    displayTimezone && displayTimezone !== 'auto'
      ? dayjs(event.start_at).tz(displayTimezone)
      : dayjs(event.start_at);
  const end =
    displayTimezone && displayTimezone !== 'auto'
      ? dayjs(event.end_at).tz(displayTimezone)
      : dayjs(event.end_at);

  const durationMs = end.diff(start, 'millisecond');
  const isMultipleOf24Hours = durationMs % (24 * 60 * 60 * 1000) === 0;

  const spansLocalMidnights =
    start.startOf('day').valueOf() === start.valueOf() &&
    end.startOf('day').valueOf() === end.valueOf();
  const wallDuration =
    durationMs + (end.utcOffset() - start.utcOffset()) * 60_000;
  return (
    durationMs > 0 &&
    (isMultipleOf24Hours ||
      (spansLocalMidnights && wallDuration % (24 * 60 * 60 * 1000) === 0))
  );
}

/** Civil date carriers for all-day rendering, with an exclusive end date.
 * Untagged UTC-midnight legacy imports preserve their stored YMD, matching mobile.
 * Other rows project actual instants into the configured display timezone.
 */
export function allDayEventCivilDates(
  event: Pick<CalendarEvent, 'start_at' | 'end_at'>,
  displayTimezone?: string
) {
  const rawStart = dayjs(event.start_at);
  const rawEnd = dayjs(event.end_at);
  if (!rawStart.isValid() || !rawEnd.isValid() || !rawEnd.isAfter(rawStart))
    return null;
  const utcStart = rawStart.utc();
  const utcEnd = rawEnd.utc();
  const midnight = (date: dayjs.Dayjs) =>
    date.hour() === 0 &&
    date.minute() === 0 &&
    date.second() === 0 &&
    date.millisecond() === 0;
  const legacyDateOnly = midnight(utcStart) && midnight(utcEnd);
  const project = (date: dayjs.Dayjs) =>
    legacyDateOnly
      ? date.utc()
      : displayTimezone && displayTimezone !== 'auto'
        ? date.tz(displayTimezone)
        : date;
  const civil = (date: dayjs.Dayjs) =>
    new Date(date.year(), date.month(), date.date());
  return { start: civil(project(rawStart)), end: civil(project(rawEnd)) };
}

// Helper function to convert Google Calendar all-day events to proper timezone
export function convertGoogleAllDayEvent(
  startDate: string | undefined,
  endDate: string | undefined,
  userTimezone?: string
): { start_at: string; end_at: string } {
  // Check if this is a date-only format (all-day event from Google)
  const isDateOnly = (dateStr: string) => /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

  if (!startDate || !endDate) {
    const now = dayjs();
    return {
      start_at: now.toISOString(),
      end_at: now.add(1, 'hour').toISOString(),
    };
  }

  // If both are date-only (Google all-day event), convert to user's timezone midnight
  if (isDateOnly(startDate) && isDateOnly(endDate)) {
    const tz =
      userTimezone === 'auto'
        ? typeof window !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : undefined
        : userTimezone;

    const startAtMidnight = tz
      ? dayjs.tz(`${startDate}T00:00:00`, tz)
      : dayjs(`${startDate}T00:00:00`);

    const endAtMidnight = tz
      ? dayjs.tz(`${endDate}T00:00:00`, tz)
      : dayjs(`${endDate}T00:00:00`);

    return {
      start_at: startAtMidnight.toISOString(),
      end_at: endAtMidnight.toISOString(),
    };
  }

  // Otherwise, use the dates as-is (they're already dateTime format)
  return {
    start_at: startDate,
    end_at: endDate,
  };
}

// Helper to create an all-day event in user's timezone
export function createAllDayEvent(
  date: Date,
  userTimezone?: string,
  durationDays: number = 1
): { start_at: string; end_at: string } {
  const tz =
    userTimezone === 'auto'
      ? typeof window !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : undefined
      : userTimezone;

  const startAtMidnight = tz
    ? dayjs.tz(date, tz).startOf('day')
    : dayjs(date).startOf('day');

  const endAtMidnight = startAtMidnight.add(durationDays, 'day');

  return {
    start_at: startAtMidnight.toISOString(),
    end_at: endAtMidnight.toISOString(),
  };
}
