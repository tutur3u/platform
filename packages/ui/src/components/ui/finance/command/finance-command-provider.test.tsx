import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceRouteProvider } from '../finance-route-context';
import { FinanceCommandProvider } from './finance-command-provider';

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      create_group: 'Create',
      description: 'Finance shortcuts',
      empty: 'No commands',
      finance: 'Finance',
      new_transaction: 'New transaction',
      new_transfer: 'New transfer',
      quick_create_title: 'Quick create',
      quick_placeholder: 'Create anything...',
      recent_transactions: 'Recent transactions',
      search_placeholder: 'Search finance...',
      title: 'Finance command center',
    };
    return labels[key] ?? key;
  },
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  listBudgets: (...args: Parameters<typeof mocks.listBudgets>) =>
    mocks.listBudgets(...args),
  listDebtLoans: (...args: Parameters<typeof mocks.listDebtLoans>) =>
    mocks.listDebtLoans(...args),
  listFinanceInvoices: (
    ...args: Parameters<typeof mocks.listFinanceInvoices>
  ) => mocks.listFinanceInvoices(...args),
  listInfiniteWallets: (
    ...args: Parameters<typeof mocks.listInfiniteWallets>
  ) => mocks.listInfiniteWallets(...args),
  listRecurringTransactions: (
    ...args: Parameters<typeof mocks.listRecurringTransactions>
  ) => mocks.listRecurringTransactions(...args),
  listTransactionCategories: (
    ...args: Parameters<typeof mocks.listTransactionCategories>
  ) => mocks.listTransactionCategories(...args),
  listTransactionTags: (
    ...args: Parameters<typeof mocks.listTransactionTags>
  ) => mocks.listTransactionTags(...args),
}));

vi.mock('../transactions/internal-api', () => ({
  listInfiniteTransactionsWithInternalApi: (
    ...args: Parameters<typeof mocks.listInfiniteTransactionsWithInternalApi>
  ) => mocks.listInfiniteTransactionsWithInternalApi(...args),
}));

function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <FinanceRouteProvider prefix="/finance">
        <FinanceCommandProvider
          wsId="ws-1"
          workspaceSlug="ws-1"
          canCreateTransactions
        />
      </FinanceRouteProvider>
    </QueryClientProvider>
  );
}

describe('FinanceCommandProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.ResizeObserver = class ResizeObserver {
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

  it('opens quick create with C and routes digit shortcuts', () => {
    renderProvider();

    fireEvent.keyDown(window, { key: 'c' });

    expect(screen.getByText('New transaction')).toBeVisible();

    fireEvent.keyDown(window, { key: '1' });

    expect(mocks.push).toHaveBeenCalledWith(
      '/ws-1/finance/transactions?create=transaction'
    );
  });

  it('opens finance search with command-k and loads recent transactions', async () => {
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

    renderProvider();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getByPlaceholderText('Search finance...')).toBeVisible();
    expect(await screen.findByText('Lunch')).toBeVisible();
  });
});
