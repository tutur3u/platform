/** Locale formatting for schedule dates. Dates are calendar dates (UTC). */

function utcDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

export function formatScheduleMonth(month: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(utcDate(`${month}-01`));
}

export function formatScheduleDay(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
    weekday: 'short',
  }).format(utcDate(date));
}

/** Full date for accessible names, e.g. "Tuesday, November 10, 2026". */
export function formatScheduleLongDay(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(utcDate(date));
}

/** Short weekday names, Monday first. */
export function scheduleWeekdayHeaders(locale: string) {
  const format = new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'narrow',
  });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    format.format(utcDate(`2024-01-0${index + 1}`))
  );
}

/** Calendar cells for a month, Monday first; null pads the first week. */
export function scheduleMonthCells(month: string) {
  const first = utcDate(`${month}-01`);
  const days = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: days },
      (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`
    ),
  ];
}
