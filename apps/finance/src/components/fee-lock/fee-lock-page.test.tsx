// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@tuturuuu/internal-api/finance-fee-lock', () => ({
  listFeeLocks: mocks.list,
}));
vi.mock('@/hooks/use-workspace-user-groups', () => ({
  useWorkspaceUserGroups: () => ({ data: [] }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'vi',
  useTranslations: () => (key: string, values?: { revision?: number }) =>
    values ? `${key}:${values.revision}` : key,
}));
vi.mock(
  '@tuturuuu/ui/finance/shared/charts/use-finance-confidential-visibility',
  () => ({
    FINANCE_HIDDEN_AMOUNT: '••••',
    useFinanceConfidentialVisibility: () => ({ isConfidential: false }),
  })
);

import { FeeLockPage } from './fee-lock-page';

const WS_ID = '00000000-0000-4000-8000-00000000f1c0';
const row = (status: 'none' | 'locked', name: string) => ({
  baseline_total: 1_200_000,
  classes: [{ group_id: 'g-1', group_name: 'Lớp A1' }],
  lock:
    status === 'none'
      ? null
      : { id: 'lock-1', revision: 2, status, total_amount: 1_100_000 },
  student_id: name,
  student_name: name,
});
const lastQuery = () => mocks.list.mock.lastCall?.[1];

describe('FeeLockPage', () => {
  it('refetches by page, month, search and retry', async () => {
    mocks.list.mockResolvedValue({
      count: 120,
      currency: 'VND',
      data: [row('locked', 'Học viên Một'), row('none', 'Học viên Hai')],
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <FeeLockPage wsId={WS_ID} currency="VND" initialMonth="2026-12" />
      </QueryClientProvider>
    );
    await screen.findByText('status_locked:2');
    expect(screen.getByText('status_none')).toBeTruthy();
    expect(lastQuery()).toEqual({
      groupId: undefined,
      month: '2026-12',
      page: 1,
      pageSize: 50,
      q: undefined,
      status: undefined,
    });
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));

    mocks.list.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'next_month' }));
    await screen.findByRole('alert');
    expect(screen.getByText('01/2027')).toBeTruthy();

    mocks.list.mockResolvedValue({ count: 0, data: [] });
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    await screen.findByText('no_students');
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '  Một ' },
    });
    fireEvent.submit(screen.getByRole('searchbox'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'Một' }));
    expect(lastQuery()).toMatchObject({ month: '2027-01', page: 1 });
  });
});
