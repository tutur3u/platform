import { expect, it } from 'vitest';
import {
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
