import { describe, expect, it } from 'vitest';
import {
  clampPrepaidMonthCount,
  getPendingInvoiceCoverage,
} from './pending-invoice-coverage';

describe('getPendingInvoiceCoverage', () => {
  it('returns no month when nothing is owed', () => {
    expect(getPendingInvoiceCoverage([])).toEqual({
      month: '',
      monthCount: 1,
      lastMonth: '',
    });
    expect(getPendingInvoiceCoverage(null)).toEqual({
      month: '',
      monthCount: 1,
      lastMonth: '',
    });
  });

  it('selects a single owed month', () => {
    expect(getPendingInvoiceCoverage(['2026-10'])).toEqual({
      month: '2026-10',
      monthCount: 1,
      lastMonth: '2026-10',
    });
  });

  it('starts at the earliest month regardless of input order', () => {
    expect(
      getPendingInvoiceCoverage(['2026-11', '2026-09', '2026-10'])
    ).toEqual({ month: '2026-09', monthCount: 3, lastMonth: '2026-11' });
  });

  it('crosses a year boundary', () => {
    expect(getPendingInvoiceCoverage(['2026-12', '2027-01'])).toEqual({
      month: '2026-12',
      monthCount: 2,
      lastMonth: '2027-01',
    });
  });

  it('stops at a gap so a separately paid month is never covered twice', () => {
    expect(getPendingInvoiceCoverage(['2026-09', '2026-11'])).toEqual({
      month: '2026-09',
      monthCount: 1,
      lastMonth: '2026-09',
    });
  });

  it('selects only the earliest month on request', () => {
    expect(
      getPendingInvoiceCoverage(['2026-09', '2026-10'], { singleMonth: true })
    ).toEqual({ month: '2026-09', monthCount: 1, lastMonth: '2026-09' });
  });

  it('ignores duplicates and malformed months', () => {
    expect(
      getPendingInvoiceCoverage(['2026-09', '2026-09', 'nope', ' 2026-10 '])
    ).toEqual({ month: '2026-09', monthCount: 2, lastMonth: '2026-10' });
  });

  it('caps the range at the prepaid month limit', () => {
    const months = Array.from({ length: 14 }, (_, index) => {
      const month = (index % 12) + 1;
      const year = 2025 + Math.floor(index / 12);
      return `${year}-${String(month).padStart(2, '0')}`;
    });

    expect(getPendingInvoiceCoverage(months)).toEqual({
      month: '2025-01',
      monthCount: 12,
      lastMonth: '2025-12',
    });
  });
});

describe('clampPrepaidMonthCount', () => {
  it('keeps valid counts and falls back to one month otherwise', () => {
    expect(clampPrepaidMonthCount(3)).toBe(3);
    expect(clampPrepaidMonthCount(99)).toBe(12);
    expect(clampPrepaidMonthCount(0)).toBe(1);
    expect(clampPrepaidMonthCount(null)).toBe(1);
    expect(clampPrepaidMonthCount(2.5)).toBe(1);
  });
});
