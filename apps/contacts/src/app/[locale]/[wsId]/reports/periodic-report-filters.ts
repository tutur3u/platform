import { parseAsString, parseAsStringLiteral } from 'nuqs';

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
  ]).withDefault('UNAPPROVED'),
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
  start: parseAsString.withDefault(''),
  end: parseAsString.withDefault(''),
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
