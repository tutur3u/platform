import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TransactionDefaultsSettings from './transaction-defaults-settings';

const RECONCILIATION_CONFIG_ID = 'default_reconciliation_category_id';

const mocks = vi.hoisted(() => ({
  categories: [] as Array<{
    id: string;
    is_expense?: boolean;
    name: string;
  }>,
  configs: {} as Record<string, string>,
  updateWorkspaceConfig: vi.fn(),
  wallets: [] as Array<{ id: string; name: string }>,
}));

vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  FINANCE_DEFAULT_RECONCILIATION_CATEGORY_CONFIG_ID:
    'default_reconciliation_category_id',
  updateWorkspaceConfig: (
    ...args: Parameters<typeof mocks.updateWorkspaceConfig>
  ) => mocks.updateWorkspaceConfig(...args),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-config', () => ({
  useWorkspaceConfig: (_wsId: string, configId: string, defaultValue = '') => ({
    data: mocks.configs[configId] ?? defaultValue,
    isLoading: false,
  }),
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-permission', () => ({
  useWorkspacePermission: () => ({
    hasPermission: true,
  }),
}));

vi.mock('@tuturuuu/ui/hooks/use-finance-transaction-preferences', () => ({
  useFinanceTransactionPreferences: () => ({
    isLastSelectionsInitialized: true,
    isLoadingRememberLastSelections: false,
    isPendingRememberLastSelections: false,
    lastSelections: {},
    rememberLastSelections: false,
    setRememberLastSelections: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-transaction-categories', () => ({
  useTransactionCategories: () => ({
    data: mocks.categories,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-wallets', () => ({
  useWallets: () => ({
    data: mocks.wallets,
    isLoading: false,
  }),
}));

vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({
    children,
    disabled,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <select
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>
      {typeof children === 'string' ? children : value}
    </option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderSettings() {
  renderWithQueryClient(
    <TransactionDefaultsSettings
      workspaceId="ws-1"
      user={{ id: 'user-1' } as never}
    />
  );
}

function setDefaultData() {
  mocks.wallets = [{ id: 'wallet-1', name: 'Cash' }];
  mocks.categories = [
    { id: 'category-food', is_expense: true, name: 'Food' },
    { id: 'category-reconcile', is_expense: true, name: 'Audit' },
  ];
}

describe('TransactionDefaultsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDefaultData();
    mocks.configs = {};
    mocks.updateWorkspaceConfig.mockResolvedValue({ message: 'success' });
  });

  it('loads a valid default reconciliation category', async () => {
    mocks.configs = {
      [RECONCILIATION_CONFIG_ID]: 'category-reconcile',
      default_category_id: 'category-food',
      default_wallet_id: 'wallet-1',
    };

    renderSettings();

    const selects = await screen.findAllByRole('combobox');
    expect(selects[2]).toHaveValue('category-reconcile');
  });

  it('ignores a missing default reconciliation category', async () => {
    mocks.configs = {
      [RECONCILIATION_CONFIG_ID]: 'deleted-category',
      default_category_id: 'category-food',
      default_wallet_id: 'wallet-1',
    };

    renderSettings();

    const selects = await screen.findAllByRole('combobox');
    expect(selects[2]).toHaveValue('none');
  });

  it('saves a separate reconciliation default without changing the transaction default', async () => {
    mocks.configs = {
      default_category_id: 'category-food',
      default_wallet_id: 'wallet-1',
    };

    renderSettings();

    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[2] as HTMLElement, {
      target: { value: 'category-reconcile' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'save' })[2] as HTMLElement
    );

    await waitFor(() => {
      expect(mocks.updateWorkspaceConfig).toHaveBeenCalledWith(
        'ws-1',
        RECONCILIATION_CONFIG_ID,
        'category-reconcile'
      );
    });
    expect(mocks.updateWorkspaceConfig).not.toHaveBeenCalledWith(
      'ws-1',
      'default_category_id',
      expect.any(String)
    );
  });

  it('clears the default reconciliation category', async () => {
    mocks.configs = {
      [RECONCILIATION_CONFIG_ID]: 'category-reconcile',
      default_category_id: 'category-food',
      default_wallet_id: 'wallet-1',
    };

    renderSettings();

    const selects = await screen.findAllByRole('combobox');
    fireEvent.change(selects[2] as HTMLElement, {
      target: { value: 'none' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'save' })[2] as HTMLElement
    );

    await waitFor(() => {
      expect(mocks.updateWorkspaceConfig).toHaveBeenCalledWith(
        'ws-1',
        RECONCILIATION_CONFIG_ID,
        ''
      );
    });
  });
});
