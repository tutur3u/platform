/**
 * The month a monthly report covers. Pure and framework-free: the reports API
 * and the Contacts UI share it, so a month means the same thing on both sides.
 */

/**
 * Teachers often write a month's report in the first days of the next month.
 * Up to and including this day of a month, "this month's report" means the
 * previous month: the default month picker and the estimated month of an
 * older report without a saved period both use it.
 */
export const REPORT_MONTH_GRACE_DAYS = 10;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** A `YYYY-MM` month. */
export function isReportMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

function parts(month: string) {
  const match = MONTH_PATTERN.exec(month);
  if (!match) throw new Error(`Invalid report month: ${month}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function format(year: number, month: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function shiftReportMonth(month: string, delta: number) {
  const value = parts(month);
  const index = value.year * 12 + value.month - 1 + delta;
  return format(Math.floor(index / 12), (index % 12) + 1);
}

/** First and last calendar day of the month, as `YYYY-MM-DD` dates. */
export function reportMonthBounds(month: string) {
  const value = parts(month);
  const lastDay = new Date(Date.UTC(value.year, value.month, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** `MM/YYYY`, as the month appears in report titles. */
export function reportMonthLabel(month: string) {
  const value = parts(month);
  return `${String(value.month).padStart(2, '0')}/${value.year}`;
}

/** Newest first, starting at `anchor`. */
export function recentReportMonths(anchor: string, count = 12) {
  return Array.from({ length: count }, (_, index) =>
    shiftReportMonth(anchor, -index)
  );
}

function formatter(timeZone: string) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  } as const;
  try {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
  }
}

/** The `YYYY-MM-DD` calendar date of an instant in `timeZone` (UTC if invalid). */
export function calendarDateInTimezone(
  instant: Date | string | number,
  timeZone: string
) {
  const values = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

/** Day 1 to REPORT_MONTH_GRACE_DAYS belongs to the previous month. */
export function reportMonthForCalendarDate(date: string) {
  const month = date.slice(0, 7);
  return Number(date.slice(8, 10)) <= REPORT_MONTH_GRACE_DAYS
    ? shiftReportMonth(month, -1)
    : month;
}

/** The month a report written now is most likely for. */
export function defaultReportMonth(now: Date | number, timeZone: string) {
  return reportMonthForCalendarDate(calendarDateInTimezone(now, timeZone));
}

/** Estimated month of a report without a saved period, from its creation. */
export function inferReportMonth(createdAt: string, timeZone: string) {
  return reportMonthForCalendarDate(
    calendarDateInTimezone(createdAt, timeZone)
  );
}

/**
 * The month a monthly report is filed under: its saved period, or (for older
 * reports saved without one) the month estimated from when it was created.
 */
export function resolveReportMonth(
  report: {
    cadence?: string | null;
    period_start?: string | null;
    created_at?: string | null;
  },
  timeZone: string
): { month: string; estimated: boolean } | null {
  if (report.cadence && report.cadence !== 'monthly') return null;
  const saved = report.period_start?.slice(0, 7);
  if (isReportMonth(saved)) return { month: saved, estimated: false };
  if (!report.created_at || Number.isNaN(Date.parse(report.created_at)))
    return null;
  return {
    month: inferReportMonth(report.created_at, timeZone),
    estimated: true,
  };
}
