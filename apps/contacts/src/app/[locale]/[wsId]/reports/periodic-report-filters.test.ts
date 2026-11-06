import { describe, expect, it } from 'vitest';
import {
  normalizePeriodicReportPeriod,
  periodicReportFilterKeys,
  periodicReportFilters,
  resolvePeriodicReportMonth,
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

describe('report month URL state', () => {
  const VN = 'Asia/Ho_Chi_Minh';
  const at = (iso: string) => new Date(iso).getTime();
  const base = { start: '', end: '', cadence: 'monthly' as const };

  it('keeps the month in its own reportMonth URL key', () => {
    expect(periodicReportFilterKeys.month).toBe('reportMonth');
    expect(periodicReportFilters.month.defaultValue).toBe('');
    expect(periodicReportFilters.month.parse('2026-10')).toBe('2026-10');
    expect(periodicReportFilters.month.parse('all')).toBe('all');
    expect(periodicReportFilters.month.serialize('2026-09')).toBe('2026-09');
  });

  it.each(['2026-13', '2026-1', '10/2026', '2026-10-01', 'latest'])(
    'drops a malformed reportMonth %s',
    (value) => {
      expect(periodicReportFilters.month.parse(value)).toBeNull();
    }
  );

  it.each([
    ['2026-11-02T09:00:00+07:00', '2026-10'],
    ['2026-11-10T23:00:00+07:00', '2026-10'],
    ['2026-11-11T08:00:00+07:00', '2026-11'],
  ])('defaults the monthly worklist on %s to %s', (now, month) => {
    expect(
      resolvePeriodicReportMonth({
        ...base,
        month: '',
        now: at(now),
        timeZone: VN,
      })
    ).toBe(month);
  });

  it('uses the month from the URL over the default', () => {
    expect(
      resolvePeriodicReportMonth({
        ...base,
        month: '2026-08',
        now: at('2026-11-02T09:00:00+07:00'),
        timeZone: VN,
      })
    ).toBe('2026-08');
  });

  it('selects no month for All months, a custom range, or another cadence', () => {
    const now = at('2026-11-20T09:00:00+07:00');
    expect(
      resolvePeriodicReportMonth({ ...base, month: 'all', now, timeZone: VN })
    ).toBeNull();
    expect(
      resolvePeriodicReportMonth({
        ...base,
        month: '2026-10',
        start: '2026-10-01',
        now,
        timeZone: VN,
      })
    ).toBeNull();
    expect(
      resolvePeriodicReportMonth({
        ...base,
        cadence: 'weekly',
        month: '2026-10',
        now,
        timeZone: VN,
      })
    ).toBeNull();
  });
});
