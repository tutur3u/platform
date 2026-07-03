import { describe, expect, it } from 'vitest';
import {
  MAX_FINANCE_DAILY_DATE_RANGE_DAYS,
  validateFinanceDateRange,
} from './date-range';

describe('finance date range validation', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('accepts a bounded explicit range', () => {
    expect(
      validateFinanceDateRange({
        endDate: '2026-05-31',
        now,
        startDate: '2026-05-01',
      })
    ).toEqual({ ok: true });
  });

  it('rejects a range that would generate too many daily points', () => {
    expect(
      validateFinanceDateRange({
        endDate: '2026-06-01',
        now,
        startDate: '2025-05-31',
      })
    ).toEqual({
      ok: false,
      message: `Date range cannot exceed ${MAX_FINANCE_DAILY_DATE_RANGE_DAYS} days`,
    });
  });

  it('rejects a lone start date that is too far from the implicit current end date', () => {
    expect(
      validateFinanceDateRange({
        now,
        startDate: '2000-01-01',
      })
    ).toEqual({
      ok: false,
      message: `Date range cannot exceed ${MAX_FINANCE_DAILY_DATE_RANGE_DAYS} days`,
    });
  });

  it('rejects invalid and reversed dates', () => {
    expect(
      validateFinanceDateRange({
        endDate: '2026-06-01',
        now,
        startDate: 'not-a-date',
      })
    ).toEqual({
      ok: false,
      message: 'Invalid date range',
    });

    expect(
      validateFinanceDateRange({
        endDate: '2026-05-01',
        now,
        startDate: '2026-06-01',
      })
    ).toEqual({
      ok: false,
      message: 'Start date must be before or equal to end date',
    });
  });
});
