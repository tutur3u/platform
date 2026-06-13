import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDialogFeatureSummary } from '../shared/create-dialog-feature-summary';
import { TransactionForm } from './form';
import { TransactionsCreateSummary } from './transactions-create-summary';

const mocks = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  createTransfer: vi.fn(),
  deleteWorkspaceStorageObjects: vi.fn(),
  listTransactionCategories: vi.fn(),
  listTransactionTagLinks: vi.fn(),
  listTransactionTags: vi.fn(),
  listWallets: vi.fn(),
  listWorkspaceStorageObjects: vi.fn(),
  preferences: {
    lastSelections: {} as { categoryId?: string; walletId?: string },
    rememberLastSelections: true,
  },
  saveLastSelections: vi.fn(),
  updateTransaction: vi.fn(),
  updateTransfer: vi.fn(),
  uploadWorkspaceStorageFile: vi.fn(),
}));

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
    lastSelections: mocks.preferences.lastSelections,
    rememberLastSelections: mocks.preferences.rememberLastSelections,
    saveLastSelections: mocks.saveLastSelections,
  }),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-config', () => ({
  useWorkspaceConfig: () => ({ data: '' }),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createTransaction: (...args: Parameters<typeof mocks.createTransaction>) =>
    mocks.createTransaction(...args),
  createTransfer: (...args: Parameters<typeof mocks.createTransfer>) =>
    mocks.createTransfer(...args),
  deleteWorkspaceStorageObjects: (
    ...args: Parameters<typeof mocks.deleteWorkspaceStorageObjects>
  ) => mocks.deleteWorkspaceStorageObjects(...args),
  listTransactionCategories: (
    ...args: Parameters<typeof mocks.listTransactionCategories>
  ) => mocks.listTransactionCategories(...args),
  listTransactionTagLinks: (
    ...args: Parameters<typeof mocks.listTransactionTagLinks>
  ) => mocks.listTransactionTagLinks(...args),
  listTransactionTags: (
    ...args: Parameters<typeof mocks.listTransactionTags>
  ) => mocks.listTransactionTags(...args),
  listWallets: (...args: Parameters<typeof mocks.listWallets>) =>
    mocks.listWallets(...args),
  listWorkspaceStorageObjects: (
    ...args: Parameters<typeof mocks.listWorkspaceStorageObjects>
  ) => mocks.listWorkspaceStorageObjects(...args),
  updateTransaction: (...args: Parameters<typeof mocks.updateTransaction>) =>
    mocks.updateTransaction(...args),
  updateTransfer: (...args: Parameters<typeof mocks.updateTransfer>) =>
    mocks.updateTransfer(...args),
  uploadWorkspaceStorageFile: (
    ...args: Parameters<typeof mocks.uploadWorkspaceStorageFile>
  ) => mocks.uploadWorkspaceStorageFile(...args),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  createTransactionCategory: vi.fn(),
  createTransactionTag: vi.fn(),
  createWallet: vi.fn(),
  updateTransactionCategory: vi.fn(),
  updateWallet: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderTransactionForm(
  props: Partial<ComponentProps<typeof TransactionForm>> = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionForm wsId="ws-1" canCreateTransactions {...props} />
    </QueryClientProvider>
  );
}

describe('TransactionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.ResizeObserver = class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    };
    mocks.preferences.lastSelections = {};
    mocks.preferences.rememberLastSelections = true;
    mocks.listTransactionCategories.mockResolvedValue([]);
    mocks.listTransactionTagLinks.mockResolvedValue([]);
    mocks.listTransactionTags.mockResolvedValue([]);
    mocks.listWallets.mockResolvedValue([]);
    mocks.listWorkspaceStorageObjects.mockResolvedValue({
      data: [],
      hasMore: false,
      total: 0,
    });
  });

  it('renders the create transaction form without invalid component errors', () => {
    renderTransactionForm();

    expect(screen.getByText('transaction-data-table.tab_basic')).toBeVisible();
    expect(screen.getByText('ws-transactions.create')).toBeVisible();
  });

  it('renders the optional time control off by default for new transactions', () => {
    renderTransactionForm();

    const includeTimeSwitch = screen.getByRole('switch', {
      name: 'transaction-data-table.include_time',
    });

    expect(includeTimeSwitch).toHaveAttribute('data-state', 'unchecked');
  });

  it('keeps the contextual wallet selected when wallet context is preferred', async () => {
    mocks.preferences.lastSelections = { walletId: 'wallet-remembered' };
    mocks.listWallets.mockResolvedValue([
      { id: 'wallet-remembered', name: 'Remembered Wallet' },
      { id: 'wallet-current', name: 'Current Wallet' },
    ]);

    renderTransactionForm({
      initialTransaction: { origin_wallet_id: 'wallet-current' },
      preferInitialWalletSelection: true,
    });

    await waitFor(() => {
      expect(screen.getByText('Current Wallet')).toBeVisible();
    });
    expect(screen.queryByText('Remembered Wallet')).not.toBeInTheDocument();
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

  it('shows a permission request when create transaction access is missing', () => {
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
          canCreateConfidentialTransactions={false}
          canCreateTransactions={false}
          canSetFinanceWalletsOnCreate
          createDescription="Create description"
          createTitle="Create"
          defaultOpen
          description="Transactions description"
          permissionRequestUser={{
            displayName: 'Jane Doe',
            id: 'user-1',
          }}
          pluralTitle="Transactions"
          singularTitle="Transaction"
          wsId="ws-1"
        />
      </QueryClientProvider>
    );

    expect(screen.getByText('create_transactions')).toBeVisible();
    expect(screen.getByText('user-1')).toBeVisible();
    expect(screen.getByText('Jane Doe')).toBeVisible();
  });
});
