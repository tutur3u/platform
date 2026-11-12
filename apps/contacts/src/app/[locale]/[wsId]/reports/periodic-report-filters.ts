import { PERIODIC_REPORT_STAGES } from '@tuturuuu/internal-api/reports';
import { isReportTitleMonthKey } from '@tuturuuu/users-core/features/reports/report-title-month';
import { createParser, parseAsString, parseAsStringLiteral } from 'nuqs';
import { z } from 'zod';

const calendarDate = z.iso.date();
const parseCalendarDate = createParser({
  parse: (value) => (calendarDate.safeParse(value).success ? value : null),
  serialize: (value) => value,
}).withDefault('');

// The month named in the report title (`YYYY-MM`, `MM` or `none`); empty
// means every month. The filter never depends on a default month, so the
// status totals on open cover every report in scope.
const parseTitleMonth = createParser({
  parse: (value) => (isReportTitleMonthKey(value) ? value : null),
  serialize: (value) => value,
}).withDefault('');

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
  titleMonth: parseTitleMonth,
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
  titleMonth: 'reportTitleMonth',
};
