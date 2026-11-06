import { describe, expect, it } from 'vitest';
import {
  buildReportMonthFilter,
  buildReportPeriodFilter,
  resolveReportPeriodTimezone,
} from './report-period-filter';

it('returns no filter without a range', () => {
  expect(buildReportPeriodFilter({ timezone: 'UTC' })).toBeNull();
});

it('builds a start-only range', () => {
  expect(
    buildReportPeriodFilter({
      periodStart: '2026-10-01',
      timezone: 'Asia/Ho_Chi_Minh',
    })
  ).toBe(
    'and(period_end.gte.2026-10-01),and(period_start.is.null,created_at.gte."2026-09-30T17:00:00.000Z")'
  );
});

it('builds an end-only range that includes the whole last day', () => {
  expect(
    buildReportPeriodFilter({
      periodEnd: '2026-11-03',
      timezone: 'Asia/Ho_Chi_Minh',
    })
  ).toBe(
    'and(period_start.lte.2026-11-03),and(period_start.is.null,created_at.lt."2026-11-03T17:00:00.000Z")'
  );
});

it('uses calendar-day bounds across a DST change', () => {
  // New York leaves DST on 1 Nov 2026: 00:00 is 04:00Z, the next midnight 05:00Z.
  expect(
    buildReportPeriodFilter({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-01',
      timezone: 'America/New_York',
    })
  ).toContain(
    'created_at.gte."2026-11-01T04:00:00.000Z",created_at.lt."2026-11-02T05:00:00.000Z"'
  );
});

it.each([
  [null, 'Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh'],
  ['auto', 'Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh'],
  ['Europe/Paris', 'Asia/Ho_Chi_Minh', 'Europe/Paris'],
  ['Not/AZone', 'Asia/Ho_Chi_Minh', 'Asia/Ho_Chi_Minh'],
  [null, 'Not/AZone', 'UTC'],
  [null, 'UTC),id.not.is.null', 'UTC'],
  [null, undefined, 'UTC'],
])('resolves workspace %s / viewer %s to %s', (workspace, viewer, expected) => {
  expect(resolveReportPeriodTimezone(workspace, viewer)).toBe(expected);
});

describe('month filter', () => {
  it('matches October by saved period, and legacy reports by estimated month in GMT+7', () => {
    // Saved period: period_start inside October. No saved period: created
    // from 11 Oct 00:00 to 10 Nov 23:59:59 in Asia/Ho_Chi_Minh, so a report
    // written on 28 Oct or on 2 Nov both file under October.
    expect(
      buildReportMonthFilter({ month: '2026-10', timezone: 'Asia/Ho_Chi_Minh' })
    ).toBe(
      'and(period_start.gte.2026-10-01,period_start.lte.2026-10-31),and(period_start.is.null,created_at.gte."2026-10-10T17:00:00.000Z",created_at.lt."2026-11-10T17:00:00.000Z")'
    );
  });

  it('rolls the legacy window into the next year for December', () => {
    expect(buildReportMonthFilter({ month: '2026-12', timezone: 'UTC' })).toBe(
      'and(period_start.gte.2026-12-01,period_start.lte.2026-12-31),and(period_start.is.null,created_at.gte."2026-12-11T00:00:00.000Z",created_at.lt."2027-01-11T00:00:00.000Z")'
    );
  });
});
