import { describe, expect, it } from 'vitest';
import {
  calendarDateInTimezone,
  defaultReportMonth,
  inferReportMonth,
  isReportMonth,
  REPORT_MONTH_GRACE_DAYS,
  recentReportMonths,
  reportMonthBounds,
  reportMonthLabel,
  resolveReportMonth,
  shiftReportMonth,
} from './report-month';

const VN = 'Asia/Ho_Chi_Minh';

describe('default report month', () => {
  it('treats the first 10 days of a month as the previous month', () => {
    expect(REPORT_MONTH_GRACE_DAYS).toBe(10);
  });

  it.each([
    ['2026-10-31T23:59:59+07:00', '2026-10'],
    ['2026-11-01T00:00:00+07:00', '2026-10'],
    ['2026-11-10T23:59:59+07:00', '2026-10'],
    ['2026-11-11T00:00:00+07:00', '2026-11'],
    ['2026-11-30T12:00:00+07:00', '2026-11'],
    ['2027-01-05T09:00:00+07:00', '2026-12'],
  ])('on %s in GMT+7 defaults to %s', (now, month) => {
    expect(defaultReportMonth(new Date(now), VN)).toBe(month);
  });

  it('reads the day in the given time zone, not UTC', () => {
    // 10 Nov 17:00 UTC is already 11 Nov in GMT+7.
    expect(defaultReportMonth(new Date('2026-11-10T17:00:00Z'), VN)).toBe(
      '2026-11'
    );
    expect(defaultReportMonth(new Date('2026-11-10T17:00:00Z'), 'UTC')).toBe(
      '2026-10'
    );
  });
});

describe('legacy month inference from created_at (GMT+7)', () => {
  it.each([
    ['31 Oct', '2026-10-31T10:00:00+07:00', '2026-10'],
    ['1 Nov', '2026-11-01T08:00:00+07:00', '2026-10'],
    ['10 Nov', '2026-11-10T23:30:00+07:00', '2026-10'],
    ['11 Nov', '2026-11-11T00:15:00+07:00', '2026-11'],
    ['10 Nov 16:59Z (10 Nov 23:59 local)', '2026-11-10T16:59:59Z', '2026-10'],
    ['10 Nov 17:00Z (11 Nov 00:00 local)', '2026-11-10T17:00:00Z', '2026-11'],
    ['31 Oct 17:30Z (1 Nov 00:30 local)', '2026-10-31T17:30:00Z', '2026-10'],
  ])('a report created on %s files under %s', (_label, createdAt, month) => {
    expect(inferReportMonth(createdAt, VN)).toBe(month);
    expect(
      resolveReportMonth(
        { cadence: 'monthly', period_start: null, created_at: createdAt },
        VN
      )
    ).toEqual({ month, estimated: true });
  });

  it('prefers the saved period and never marks it estimated', () => {
    expect(
      resolveReportMonth(
        {
          cadence: 'monthly',
          period_start: '2026-10-01',
          created_at: '2026-11-02T03:00:00Z',
        },
        VN
      )
    ).toEqual({ month: '2026-10', estimated: false });
  });

  it('gives no month to other cadences or reports without dates', () => {
    expect(
      resolveReportMonth(
        { cadence: 'weekly', period_start: null, created_at: '2026-11-02' },
        VN
      )
    ).toBeNull();
    expect(
      resolveReportMonth(
        { cadence: 'monthly', period_start: null, created_at: null },
        VN
      )
    ).toBeNull();
  });
});

describe('month values', () => {
  it('gives calendar bounds, including leap February', () => {
    expect(reportMonthBounds('2026-10')).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
    });
    expect(reportMonthBounds('2028-02')).toEqual({
      start: '2028-02-01',
      end: '2028-02-29',
    });
  });

  it('shifts across years and lists recent months newest first', () => {
    expect(shiftReportMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftReportMonth('2026-01', -1)).toBe('2025-12');
    expect(recentReportMonths('2026-02', 4)).toEqual([
      '2026-02',
      '2026-01',
      '2025-12',
      '2025-11',
    ]);
  });

  it('labels a month as MM/YYYY', () => {
    expect(reportMonthLabel('2026-10')).toBe('10/2026');
  });

  it.each(['2026-13', '2026-1', '26-10', '2026-10-01', '', null, 'all'])(
    'rejects malformed month %j',
    (value) => {
      expect(isReportMonth(value)).toBe(false);
    }
  );

  it('falls back to UTC for an unknown time zone', () => {
    expect(calendarDateInTimezone('2026-11-10T17:00:00Z', 'Not/AZone')).toBe(
      '2026-11-10'
    );
  });
});
