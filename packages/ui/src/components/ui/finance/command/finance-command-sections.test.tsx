import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command, CommandList } from '../../command';
import { FinanceRouteProvider } from '../finance-route-context';
import type { FinanceCommandActionPermissions } from './finance-command-actions';
import {
  type FinanceCommandSectionContext,
  FinanceCommandSections,
} from './finance-command-sections';

const mocks = vi.hoisted(() => ({
  listBudgets: vi.fn(),
  listDebtLoans: vi.fn(),
  listFinanceInvoices: vi.fn(),
  listInfiniteTransactionsWithInternalApi: vi.fn(),
  listInfiniteWallets: vi.fn(),
  listRecurringTransactions: vi.fn(),
  listTransactionCategories: vi.fn(),
  listTransactionTags: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) =>
    ({
      create_group: 'Create',
      new_budget: 'New budget',
      new_transaction: 'New transaction',
      new_transfer: 'New transfer',
      new_wallet: 'New wallet',
      recent_transactions: 'Recent transactions',
      search_failed: 'Could not load finance records',
      searching: 'Searching finance records',
      title: 'Finance command center',
      tools_group: 'Tools',
    })[key] ?? key,
}));
vi.mock('@tuturuuu/internal-api/finance', () => ({
  listBudgets: (...args: unknown[]) => mocks.listBudgets(...args),
  listDebtLoans: (...args: unknown[]) => mocks.listDebtLoans(...args),
  listFinanceInvoices: (...args: unknown[]) =>
    mocks.listFinanceInvoices(...args),
  listInfiniteWallets: (...args: unknown[]) =>
    mocks.listInfiniteWallets(...args),
  listRecurringTransactions: (...args: unknown[]) =>
    mocks.listRecurringTransactions(...args),
  listTransactionCategories: (...args: unknown[]) =>
    mocks.listTransactionCategories(...args),
  listTransactionTags: (...args: unknown[]) =>
    mocks.listTransactionTags(...args),
}));
vi.mock('../transactions/internal-api', () => ({
  listInfiniteTransactionsWithInternalApi: (...args: unknown[]) =>
    mocks.listInfiniteTransactionsWithInternalApi(...args),
}));

const onClose = vi.fn();

function renderSections(
  context: Partial<FinanceCommandSectionContext> = {},
  permissions: FinanceCommandActionPermissions = {
    canCreateTransactions: true,
    canCreateWallets: false,
    canManageFinance: false,
  }
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FinanceRouteProvider prefix="/finance">
        <Command shouldFilter={false}>
          <CommandList>
            <FinanceCommandSections
              {...permissions}
              context={{
                activeTab: 'all',
                isOpen: true,
                labels: { retry: 'Retry' },
                mode: 'default',
                onClose,
                query: '',
                ...context,
              }}
              workspaceSlug="ws-1"
              wsId="ws-1"
            />
          </CommandList>
        </Command>
      </FinanceRouteProvider>
    </QueryClientProvider>
  );
}

describe('FinanceCommandSections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.ResizeObserver = class {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    mocks.listBudgets.mockResolvedValue([]);
    mocks.listDebtLoans.mockResolvedValue([]);
    mocks.listFinanceInvoices.mockResolvedValue({ data: [] });
    mocks.listInfiniteTransactionsWithInternalApi.mockResolvedValue({
      data: [],
    });
    mocks.listInfiniteWallets.mockResolvedValue({ data: [] });
    mocks.listRecurringTransactions.mockResolvedValue([]);
    mocks.listTransactionCategories.mockResolvedValue([]);
    mocks.listTransactionTags.mockResolvedValue([]);
  });

  it('keeps permission filtering: no wallet or budget actions without access', () => {
    renderSections({ activeTab: 'actions' });
    expect(screen.getByText('New transaction')).toBeTruthy();
    expect(screen.queryByText('New wallet')).toBeNull();
    expect(screen.queryByText('New budget')).toBeNull();
  });

  it('runs quick-create digit shortcuts and closes the center', () => {
    renderSections({ activeTab: 'actions', mode: 'quick-create' });
    fireEvent.keyDown(window, { key: '1' });
    expect(onClose).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith(
      '/ws-1/finance/transactions?create=transaction'
    );
  });

  it('leaves digits alone outside quick create', () => {
    renderSections({ activeTab: 'actions' });
    fireEvent.keyDown(window, { key: '1' });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('searches records only in the All scope of a regular session', async () => {
    mocks.listInfiniteTransactionsWithInternalApi.mockResolvedValue({
      data: [
        {
          amount: -12,
          description: 'Lunch',
          id: 'tx-1',
          taken_at: '2026-06-13T12:00:00.000Z',
          wallet_currency: 'USD',
          wallet_name: 'Cash',
        },
      ],
    });
    const view = renderSections({ query: 'lun' });
    expect(await screen.findByText('Lunch')).toBeTruthy();
    expect(mocks.listInfiniteTransactionsWithInternalApi).toHaveBeenCalledWith(
      'ws-1',
      { limit: 6, q: 'lun' }
    );
    view.unmount();

    mocks.listInfiniteTransactionsWithInternalApi.mockClear();
    renderSections({ activeTab: 'actions' });
    renderSections({ activeTab: 'all', mode: 'quick-create' });
    expect(mocks.listInfiniteTransactionsWithInternalApi).not.toHaveBeenCalled();
  });

  it('keeps actions visible when record search fails and offers retry', async () => {
    mocks.listInfiniteWallets.mockRejectedValueOnce(new Error('Failed'));
    renderSections();
    expect(
      await screen.findByText('Could not load finance records')
    ).toBeTruthy();
    expect(screen.getByText('New transaction')).toBeTruthy();

    mocks.listInfiniteWallets.mockResolvedValue({ data: [] });
    fireEvent.click(screen.getByText('Could not load finance records'));
    await waitFor(() =>
      expect(mocks.listInfiniteWallets).toHaveBeenCalledTimes(2)
    );
  });

  it('renders nothing in scopes Finance does not serve', () => {
    renderSections({ activeTab: 'apps' });
    expect(screen.queryByText('New transaction')).toBeNull();
  });
});
