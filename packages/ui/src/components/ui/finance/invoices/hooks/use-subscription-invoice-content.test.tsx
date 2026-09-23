import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserGroup } from '../utils';
import { useSubscriptionInvoiceContent } from './use-subscription-invoice-content';

const translate = Object.assign(
  (key: string, values?: Record<string, unknown>) =>
    values?.monthName ? String(values.monthName) : key,
  { has: () => true }
);
vi.mock('next-intl', () => ({ useTranslations: () => translate }));
const base = {
  enabled: true,
  selectedGroupIds: ['g1'],
  selectedMonth: '2026-01',
  prepaidMonthCount: 3,
  userGroups: [
    {
      workspace_user_groups: {
        id: 'g1',
        name: 'Class A',
        sessions: [],
        ws_id: 'ws',
        archived: false,
        cert_template: 'original',
        created_at: null,
        creator_id: null,
        description: null,
        ending_date: null,
        is_course_published: false,
        is_guest: false,
        notes: null,
        starting_date: '2026-01-01',
      },
    },
  ] satisfies UserGroup[],
  groupProducts: [],
  subscriptionSelectedProducts: [],
  userAttendance: [],
  isSelectedMonthPaid: false,
  locale: 'en',
  onNotesChange: vi.fn(),
};
describe('subscription invoice month descriptions', () => {
  it('lists separated unpaid months without claiming the paid month between them', () => {
    const onContentChange = vi.fn();
    renderHook(() =>
      useSubscriptionInvoiceContent({
        ...base,
        onContentChange,
        latestSubscriptionInvoices: [
          {
            group_id: 'g1',
            valid_until: '2026-03-01',
            covered_months: ['2026-02-01'],
          },
        ],
      })
    );
    expect(onContentChange).toHaveBeenLastCalledWith(
      'January 2026, March 2026'
    );
  });
  it('keeps a compact range for contiguous unpaid months', () => {
    const onContentChange = vi.fn();
    renderHook(() =>
      useSubscriptionInvoiceContent({
        ...base,
        onContentChange,
        latestSubscriptionInvoices: [],
      })
    );
    expect(onContentChange).toHaveBeenLastCalledWith(
      'January 2026 - March 2026'
    );
  });
  it('does not substitute a future expiry for the selected fully covered range', () => {
    const onContentChange = vi.fn();
    renderHook(() =>
      useSubscriptionInvoiceContent({
        ...base,
        onContentChange,
        isSelectedMonthPaid: true,
        latestSubscriptionInvoices: [
          { group_id: 'g1', valid_until: '2027-01-01' },
        ],
      })
    );
    expect(onContentChange).toHaveBeenLastCalledWith(
      'January 2026 - March 2026'
    );
  });
});
