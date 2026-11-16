import { describe, expect, it } from 'vitest';
import {
  financeMonthRange,
  financePeriodTimeZone,
  toFinanceRecentRows,
} from './finance-period';

describe('financePeriodTimeZone', () => {
  it('uses an explicit workspace zone and UTC for auto, unset or invalid', () => {
    expect(financePeriodTimeZone('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh');
    expect(financePeriodTimeZone('auto')).toBe('UTC');
    expect(financePeriodTimeZone(null)).toBe('UTC');
    expect(financePeriodTimeZone('Mars/Olympus')).toBe('UTC');
  });
});

describe('financeMonthRange', () => {
  it('starts the month at local midnight in the workspace zone', () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Ho Chi Minh City (UTC+7).
    expect(
      financeMonthRange(new Date('2026-10-31T23:30:00Z'), 'Asia/Ho_Chi_Minh')
    ).toEqual({
      start: '2026-10-31T17:00:00.000Z',
      end: '2026-11-30T16:59:59.999Z',
    });
  });

  it('stays in the previous month west of UTC near the edge', () => {
    // 02:00 UTC on 1 Dec is still 30 Nov in New York (UTC-5).
    expect(
      financeMonthRange(new Date('2026-12-01T02:00:00Z'), 'America/New_York')
    ).toEqual({
      start: '2026-11-01T04:00:00.000Z',
      end: '2026-12-01T04:59:59.999Z',
    });
  });

  it('keeps the UTC month for UTC, including leap February', () => {
    expect(financeMonthRange(new Date('2028-02-29T23:30:00Z'), 'UTC')).toEqual({
      start: '2028-02-01T00:00:00.000Z',
      end: '2028-02-29T23:59:59.999Z',
    });
  });
});

describe('toFinanceRecentRows', () => {
  it('keeps withheld amounts null and labels from description or category', () => {
    expect(
      toFinanceRecentRows([
        { id: 'a', amount: -320000, description: 'Groceries', taken_at: '2026-11-16T03:00:00Z' },
        { id: 'b', amount: null, description: null, category: 'Salary', taken_at: '2026-11-15T03:00:00Z' },
        { id: 'c', taken_at: 5 },
      ])
    ).toEqual([
      { id: 'a', label: 'Groceries', amount: -320000, takenAt: '2026-11-16T03:00:00Z' },
      { id: 'b', label: 'Salary', amount: null, takenAt: '2026-11-15T03:00:00Z' },
    ]);
  });
});
