import { createParser, parseAsString, parseAsStringLiteral } from 'nuqs';
import { z } from 'zod';

const calendarDate = z.iso.date();
const parseCalendarDate = createParser({
  parse: (value) => (calendarDate.safeParse(value).success ? value : null),
  serialize: (value) => value,
}).withDefault('');

export function normalizePeriodicReportPeriod(start: string, end: string) {
  return start && end && start > end
    ? { start: end, end: start }
    : { start, end };
}

// Keep periodic filters independent from the daily report URL state.
export const periodicReportFilters = {
  cadence: parseAsStringLiteral([
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
  ]).withDefault('PENDING'),
  delivery: parseAsStringLiteral([
    'all',
    'draft',
    'queued',
    'processing',
    'sent',
    'failed',
    'blocked',
    'cancelled',
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
};
export const periodicReportFilterKeys = {
  cadence: 'reportCadence',
  query: 'reportQuery',
  approval: 'reportApproval',
  delivery: 'reportDelivery',
  generation: 'reportGeneration',
  sort: 'reportSort',
  direction: 'reportDirection',
  start: 'reportStart',
  end: 'reportEnd',
};
