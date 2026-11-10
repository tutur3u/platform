import { describe, expect, it } from 'vitest';
import {
  normalizePeriodicReportPeriod,
  periodicReportFilterKeys,
  periodicReportFilters,
} from './periodic-report-filters';

it('defaults to pending monthly reports without hiding older undated reports', () => {
  expect(periodicReportFilters.stage.defaultValue).toBe('pending');
  expect(periodicReportFilters.approval.defaultValue).toBe('all');
  expect(periodicReportFilters.cadence.defaultValue).toBe('monthly');
  expect(periodicReportFilters.cadence.parse('all')).toBe('all');
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

it.each(['invalid', '2026-02-30', '2026-09-12T00:00:00Z'])(
  'rejects malformed calendar-date URL values: %s',
  (value) => {
    expect(periodicReportFilters.start.parse(value)).toBeNull();
    expect(periodicReportFilters.end.parse(value)).toBeNull();
  }
);
it('normalizes reversed URL bounds and retains valid or open-ended periods', () => {
  expect(periodicReportFilters.start.parse('2024-02-29')).toBe('2024-02-29');
  expect(normalizePeriodicReportPeriod('2026-09-30', '2026-09-01')).toEqual({
    start: '2026-09-01',
    end: '2026-09-30',
  });
  expect(normalizePeriodicReportPeriod('', '2026-09-30')).toEqual({
    start: '',
    end: '2026-09-30',
  });
});

describe('title month URL state', () => {
  it('keeps the title month in its own reportTitleMonth URL key', () => {
    expect(periodicReportFilterKeys.titleMonth).toBe('reportTitleMonth');
    // Empty means every month: nothing narrows the totals on open.
    expect(periodicReportFilters.titleMonth.defaultValue).toBe('');
    expect(periodicReportFilters.titleMonth.parse('2026-10')).toBe('2026-10');
    expect(periodicReportFilters.titleMonth.parse('09')).toBe('09');
    expect(periodicReportFilters.titleMonth.parse('none')).toBe('none');
    expect(periodicReportFilters.titleMonth.serialize('09')).toBe('09');
  });

  it.each(['all', '9', '13', '2026-13', '2026-9', 'tháng 9', ''])(
    'drops a malformed reportTitleMonth %j',
    (value) => {
      expect(periodicReportFilters.titleMonth.parse(value)).toBeNull();
    }
  );
});
