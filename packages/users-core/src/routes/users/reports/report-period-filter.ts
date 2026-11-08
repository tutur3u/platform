import { isValidTimezone } from '@tuturuuu/utils/timezone';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import {
  REPORT_MONTH_GRACE_DAYS,
  reportMonthBounds,
  shiftReportMonth,
} from '../../../features/reports/report-month';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

function usableTimezone(value?: string | null) {
  return value && value !== 'auto' && isValidTimezone(value) ? value : null;
}

/** Workspace timezone first, then the viewer's browser timezone, then UTC. */
export function resolveReportPeriodTimezone(
  workspaceTimezone?: string | null,
  viewerTimezone?: string | null
) {
  return (
    usableTimezone(workspaceTimezone) ?? usableTimezone(viewerTimezone) ?? 'UTC'
  );
}

function startOfDay(date: string, timezone: string) {
  return dayjs.tz(date, timezone).toISOString();
}

/**
 * PostgREST `or` filter for a report-period range (inclusive calendar dates).
 * A saved period must overlap the range. Reports without a saved period, such
 * as manually written ones, match when they were created inside the range,
 * using whole days in `timezone`.
 */
export function buildReportPeriodFilter({
  periodStart,
  periodEnd,
  timezone,
}: {
  periodStart?: string;
  periodEnd?: string;
  timezone: string;
}) {
  if (!periodStart && !periodEnd) return null;
  const saved: string[] = [];
  const unsaved = ['period_start.is.null'];
  if (periodEnd) saved.push(`period_start.lte.${periodEnd}`);
  if (periodStart) {
    saved.push(`period_end.gte.${periodStart}`);
    unsaved.push(`created_at.gte."${startOfDay(periodStart, timezone)}"`);
  }
  if (periodEnd) {
    const nextDay = dayjs.utc(periodEnd).add(1, 'day').format('YYYY-MM-DD');
    unsaved.push(`created_at.lt."${startOfDay(nextDay, timezone)}"`);
  }
  return `and(${saved.join(',')}),and(${unsaved.join(',')})`;
}

/**
 * PostgREST `or` filter for one report month (`YYYY-MM`). A saved period
 * matches when it starts in that month. A report without a saved period
 * (every manually written report before the month picker) matches by its
 * estimated month: created after day REPORT_MONTH_GRACE_DAYS of the month and
 * up to that day of the next month, in `timezone`.
 */
export function buildReportMonthFilter({
  month,
  timezone,
}: {
  month: string;
  timezone: string;
}) {
  const { start, end } = reportMonthBounds(month);
  const firstDay = String(REPORT_MONTH_GRACE_DAYS + 1).padStart(2, '0');
  const from = startOfDay(`${month}-${firstDay}`, timezone);
  const to = startOfDay(`${shiftReportMonth(month, 1)}-${firstDay}`, timezone);
  return `and(period_start.gte.${start},period_start.lte.${end}),and(period_start.is.null,created_at.gte."${from}",created_at.lt."${to}")`;
}

/** Send months are always counted in Vietnam local time. */
export const REPORT_SENT_MONTH_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * PostgREST `or` filter for one month (`YYYY-MM`) across every report stage.
 * Reports in any stage except Sent keep the coverage month of
 * `buildReportMonthFilter`. Sent reports belong to the month they were
 * actually sent: `delivered_at` from the 1st at 00:00 to the 1st of the next
 * month in `REPORT_SENT_MONTH_TIMEZONE`, whatever the workspace or viewer
 * timezone. Sent reports without `delivered_at` are also returned so the
 * caller can count them with `isUndatedSentReport` and leave them out of the
 * month; they appear only under All months.
 */
export function buildReportStageMonthFilter({
  month,
  timezone,
}: {
  month: string;
  timezone: string;
}) {
  const from = startOfDay(`${month}-01`, REPORT_SENT_MONTH_TIMEZONE);
  const to = startOfDay(
    `${shiftReportMonth(month, 1)}-01`,
    REPORT_SENT_MONTH_TIMEZONE
  );
  const coverage = buildReportMonthFilter({ month, timezone });
  return `and(report_stage.neq.sent,or(${coverage})),and(report_stage.eq.sent,delivered_at.gte."${from}",delivered_at.lt."${to}"),and(report_stage.eq.sent,delivered_at.is.null)`;
}

/** A Sent report with no recorded send date, so it has no send month. */
export function isUndatedSentReport(row: {
  report_stage?: string | null;
  delivered_at?: string | null;
}) {
  return row.report_stage === 'sent' && !row.delivered_at;
}
