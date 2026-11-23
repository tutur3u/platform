import { describe, expect, it } from 'vitest';
import { buildPendingInvoiceCreateUrl } from './pending-columns';

describe('buildPendingInvoiceCreateUrl', () => {
  it('carries both the billable quantity and suggested monetary total', () => {
    const url = new URL(
      buildPendingInvoiceCreateUrl({
        attendanceDays: 3,
        financePrefix: '',
        groupIds: ['group-1', 'group-2'],
        monthsOwed: ['2026-07'],
        potentialTotal: 1_500_000,
        useAttendanceBased: true,
        userId: 'user-1',
        wsId: 'ws-1',
      }),
      'https://finance.test'
    );

    expect(url.pathname).toBe('/ws-1/invoices/new');
    expect(url.searchParams.get('billable_quantity')).toBe('3');
    expect(url.searchParams.get('suggested_total')).toBe('1500000');
    expect(url.searchParams.get('amount')).toBeNull();
    expect(url.searchParams.get('group_ids')).toBe('group-1,group-2');
    expect(url.searchParams.get('month')).toBe('2026-07');
    expect(url.searchParams.get('prepaid_month_count')).toBeNull();
  });

  it('opens at the earliest owed month with the contiguous range selected', () => {
    const url = new URL(
      buildPendingInvoiceCreateUrl({
        attendanceDays: 9,
        financePrefix: '',
        groupIds: ['group-1'],
        monthsOwed: ['2026-11', '2026-09', '2026-10'],
        potentialTotal: 4_500_000,
        useAttendanceBased: true,
        userId: 'user-1',
        wsId: 'ws-1',
      }),
      'https://finance.test'
    );

    expect(url.searchParams.get('month')).toBe('2026-09');
    expect(url.searchParams.get('prepaid_month_count')).toBe('3');
    expect(url.searchParams.get('suggested_total')).toBe('4500000');
    expect(url.searchParams.get('billable_quantity')).toBeNull();
  });

  it('selects only the earliest month for a row spanning several classes', () => {
    const url = new URL(
      buildPendingInvoiceCreateUrl({
        attendanceDays: 9,
        financePrefix: '',
        groupIds: ['group-1', 'group-2'],
        monthsOwed: ['2026-09', '2026-10'],
        potentialTotal: 3_000_000,
        useAttendanceBased: true,
        userId: 'user-1',
        wsId: 'ws-1',
      }),
      'https://finance.test'
    );

    expect(url.searchParams.get('month')).toBe('2026-09');
    expect(url.searchParams.get('prepaid_month_count')).toBeNull();
  });
});
