import { describe, expect, it } from 'vitest';
import { buildPendingInvoiceCreateUrl } from './pending-columns';

describe('buildPendingInvoiceCreateUrl', () => {
  it('carries both the billable quantity and suggested monetary total', () => {
    const url = new URL(
      buildPendingInvoiceCreateUrl({
        attendanceDays: 3,
        financePrefix: '',
        groupIds: ['group-1', 'group-2'],
        month: '2026-07',
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
  });
});
