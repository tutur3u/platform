import {
  buildDateInTimezone,
  getDatePartsInTimezone,
  resolveTaskTimezone,
} from '@tuturuuu/utils/task-date-timezone';

/** Local fields carry a calendar day; this Date is never an event instant. */
export function calendarDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function calendarInstantDay(instant: Date, zone?: string): Date {
  const parts = getDatePartsInTimezone(
    instant,
    resolveTaskTimezone(zone ?? 'auto')
  );
  return new Date(parts.year, parts.month - 1, parts.day);
}
export function calendarToday(zone?: string, now = new Date()): Date {
  return calendarInstantDay(now, zone);
}
/** Construct each midnight independently so DST days can span 23 or 25 hours. */
export function calendarDayBoundary(day: Date, zone?: string): Date {
  return buildDateInTimezone(
    day.getFullYear(),
    day.getMonth() + 1,
    day.getDate(),
    0,
    0,
    resolveTaskTimezone(zone ?? 'auto')
  );
}
export function calendarQueryRange(dates: Date[], zone?: string) {
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) throw new Error('Calendar range needs at least one day');
  const afterLast = new Date(
    last.getFullYear(),
    last.getMonth(),
    last.getDate() + 1
  );
  return {
    start: calendarDayBoundary(first, zone),
    end: calendarDayBoundary(afterLast, zone),
  };
}
/** Date-only navigation preserves its YMD; timestamp navigation projects an instant. */
export function calendarNavigationDate(
  value: string,
  zone?: string
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
    return calendarDayKey(date) === value ? date : null;
  }
  const instant = new Date(value);
  return Number.isFinite(instant.getTime())
    ? calendarInstantDay(instant, zone)
    : null;
}
