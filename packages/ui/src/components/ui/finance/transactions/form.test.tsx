import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDialogFeatureSummary } from '../shared/create-dialog-feature-summary';
import { TransactionForm } from './form';
import { TransactionsCreateSummary } from './transactions-create-summary';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

vi.mock('@tuturuuu/ui/hooks/use-exchange-rates', () => ({
  useExchangeRates: () => ({
    data: { data: [], date: null },
  }),
}));

vi.mock('@tuturuuu/ui/hooks/use-finance-transaction-preferences', () => ({
  useFinanceTransactionPreferences: () => ({
    isLastSelectionsInitialized: true,
    isLoadingRememberLastSelections: false,
    lastSelections: {},
    rememberLastSelections: true,
    saveLastSelections: vi.fn(),
  }),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-config', () => ({
  useWorkspaceConfig: () => ({ data: '' }),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createTransaction: vi.fn(),
  createTransfer: vi.fn(),
  deleteWorkspaceStorageObjects: vi.fn(),
  listTransactionCategories: vi.fn().mockResolvedValue([]),
  listTransactionTagLinks: vi.fn().mockResolvedValue([]),
  listTransactionTags: vi.fn().mockResolvedValue([]),
  listWallets: vi.fn().mockResolvedValue([]),
  listWorkspaceStorageObjects: vi.fn().mockResolvedValue({
    data: [],
    hasMore: false,
    total: 0,
  }),
  updateTransaction: vi.fn(),
  updateTransfer: vi.fn(),
  uploadWorkspaceStorageFile: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  createTransactionCategory: vi.fn(),
  createTransactionTag: vi.fn(),
  createWallet: vi.fn(),
  updateTransactionCategory: vi.fn(),
  updateWallet: vi.fn(),
}));

function renderTransactionForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionForm wsId="ws-1" canCreateTransactions />
    </QueryClientProvider>
  );
}

describe('TransactionForm', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
  });

  it('renders the create transaction form without invalid component errors', () => {
    renderTransactionForm();

    expect(screen.getByText('transaction-data-table.tab_basic')).toBeVisible();
    expect(screen.getByText('ws-transactions.create')).toBeVisible();
  });

  it('renders inside the create dialog summary when opened from query state', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CreateDialogFeatureSummary
          defaultOpen
          pluralTitle="Transactions"
          singularTitle="Transaction"
          createTitle="Create"
          form={<TransactionForm wsId="ws-1" canCreateTransactions />}
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('transaction-data-table.tab_basic')).toBeVisible();
  });

  it('renders through the transaction create summary client boundary', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TransactionsCreateSummary
          canChangeFinanceWallets
          canCreateConfidentialTransactions
          canCreateTransactions
          canSetFinanceWalletsOnCreate
          createDescription="Create description"
          createTitle="Create"
          defaultOpen
          description="Transactions description"
          pluralTitle="Transactions"
          singularTitle="Transaction"
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('transaction-data-table.tab_basic')).toBeVisible();
  });
});
