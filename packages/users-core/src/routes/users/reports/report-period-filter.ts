import { isValidTimezone } from '@tuturuuu/utils/timezone';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

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
