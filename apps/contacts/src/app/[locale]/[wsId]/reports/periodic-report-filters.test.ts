import { expect, it } from 'vitest';
import {
  periodicReportFilterKeys,
  periodicReportFilters,
} from './periodic-report-filters';

it('defaults to unapproved monthly reports without hiding older undated reports', () => {
  expect(periodicReportFilters.approval.defaultValue).toBe('UNAPPROVED');
  expect(periodicReportFilters.cadence.defaultValue).toBe('monthly');
  expect(periodicReportFilters.start.defaultValue).toBe('');
  expect(periodicReportFilters.end.defaultValue).toBe('');
});
it('keeps every periodic URL parameter separate from daily report filters', () => {
  expect(new Set(Object.values(periodicReportFilterKeys)).size).toBe(
    Object.keys(periodicReportFilters).length
  );
  for (const key of Object.values(periodicReportFilterKeys))
    expect(key).toMatch(/^report[A-Z]/);
  expect(periodicReportFilters.approval.parse('APPROVED')).toBe('APPROVED');
  expect(periodicReportFilters.sort.parse('updated')).toBe('updated');
});
