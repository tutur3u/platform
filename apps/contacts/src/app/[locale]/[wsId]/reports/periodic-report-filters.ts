import { PERIODIC_REPORT_STAGES } from '@tuturuuu/internal-api/reports';
import {
  defaultReportMonth,
  isReportMonth,
} from '@tuturuuu/users-core/features/reports/report-month';
import { getBrowserTimezone } from '@tuturuuu/utils/timezone';
import { createParser, parseAsString, parseAsStringLiteral } from 'nuqs';
import { z } from 'zod';

const calendarDate = z.iso.date();
const parseCalendarDate = createParser({
  parse: (value) => (calendarDate.safeParse(value).success ? value : null),
  serialize: (value) => value,
}).withDefault('');

// `YYYY-MM`, `all` for every month, or empty for the default month.
const parseReportMonth = createParser({
  parse: (value) => (value === 'all' || isReportMonth(value) ? value : null),
  serialize: (value) => value,
}).withDefault('');

/**
 * The month the monthly worklist shows: the URL month, else the default
 * (previous month during the first 10 days). None for All months, for a
 * custom from/to range (the advanced option), or for other cadences.
 */
export function resolvePeriodicReportMonth({
  cadence,
  end,
  month,
  now,
  start,
  timeZone,
}: {
  cadence: string;
  end: string;
  month: string | undefined;
  now: number;
  start: string;
  timeZone: string;
}) {
  if (cadence !== 'monthly' || start || end || month === 'all') return null;
  return month && isReportMonth(month)
    ? month
    : defaultReportMonth(now, timeZone);
}

/** The shown month, the picker's default month, and the viewer time zone. */
export function periodicReportMonthScope(filters: {
  cadence: string;
  end: string;
  month: string | undefined;
  start: string;
}) {
  const now = Date.now();
  const timeZone = getBrowserTimezone();
  const reportMonth = resolvePeriodicReportMonth({
    ...filters,
    now,
    timeZone,
  });
  return {
    timeZone,
    reportMonth,
    /** Picker value: the month, `all`, or empty while a range is set. */
    pickerValue: reportMonth ?? (filters.month === 'all' ? 'all' : ''),
    defaultMonth:
      filters.cadence === 'monthly'
        ? defaultReportMonth(now, timeZone)
        : undefined,
  };
}

export function normalizePeriodicReportPeriod(start: string, end: string) {
  return start && end && start > end
    ? { start: end, end: start }
    : { start, end };
}

// Keep periodic filters independent from the daily report URL state.
export const periodicReportFilters = {
  stage: parseAsStringLiteral(['all', ...PERIODIC_REPORT_STAGES]).withDefault(
    'pending'
  ),
  cadence: parseAsStringLiteral([
    'all',
    'weekly',
    'monthly',
    'quarterly',
    'yearly',
  ]).withDefault('monthly'),
  query: parseAsString.withDefault(''),
  approval: parseAsStringLiteral([
    'all',
    'UNAPPROVED',
    'PENDING',
    'APPROVED',
    'REJECTED',
  ]).withDefault('all'),
  delivery: parseAsStringLiteral([
    'all',
    'draft',
    'queued',
    'processing',
    'sent',
    'failed',
    'blocked',
    'cancelled',
    'skipped',
  ]).withDefault('all'),
  generation: parseAsStringLiteral(['all', 'draft']).withDefault('all'),
  sort: parseAsStringLiteral([
    'period',
    'title',
    'updated',
    'user',
  ]).withDefault('period'),
  direction: parseAsStringLiteral(['asc', 'desc']).withDefault('desc'),
  start: parseCalendarDate,
  end: parseCalendarDate,
  month: parseReportMonth,
};
export const periodicReportFilterKeys = {
  stage: 'reportStage',
  cadence: 'reportCadence',
  query: 'reportQuery',
  approval: 'reportApproval',
  delivery: 'reportDelivery',
  generation: 'reportGeneration',
  sort: 'reportSort',
  direction: 'reportDirection',
  start: 'reportStart',
  end: 'reportEnd',
  month: 'reportMonth',
};
