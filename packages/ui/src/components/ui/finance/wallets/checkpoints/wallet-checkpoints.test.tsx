import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletCheckpointAdjustmentDialog } from './wallet-checkpoint-adjustment-dialog';
import { WalletCheckpointAmount } from './wallet-checkpoint-amount';
import { WalletCheckpointHistoryDialog } from './wallet-checkpoint-history-dialog';
import { WalletCheckpointPanel } from './wallet-checkpoint-panel';
import { WalletTotalCheckDialog } from './wallet-total-check-dialog';

const mocks = vi.hoisted(() => ({
  createWalletCheckpointBatch: vi.fn(),
  createWalletCheckpointReconciliation: vi.fn(),
  deleteWalletCheckpoint: vi.fn(),
  getWalletCheckpointHistory: vi.fn(),
  isConfidential: true,
  listTransactionCategories: vi.fn(),
  listWalletCheckpoints: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  createWalletCheckpoint: vi.fn(),
  createWalletCheckpointBatch: (
    ...args: Parameters<typeof mocks.createWalletCheckpointBatch>
  ) => mocks.createWalletCheckpointBatch(...args),
  createWalletCheckpointReconciliation: (
    ...args: Parameters<typeof mocks.createWalletCheckpointReconciliation>
  ) => mocks.createWalletCheckpointReconciliation(...args),
  deleteWalletCheckpoint: (
    ...args: Parameters<typeof mocks.deleteWalletCheckpoint>
  ) => mocks.deleteWalletCheckpoint(...args),
  getWalletCheckpointHistory: (
    ...args: Parameters<typeof mocks.getWalletCheckpointHistory>
  ) => mocks.getWalletCheckpointHistory(...args),
  listTransactionCategories: (
    ...args: Parameters<typeof mocks.listTransactionCategories>
  ) => mocks.listTransactionCategories(...args),
  listWalletCheckpoints: (
    ...args: Parameters<typeof mocks.listWalletCheckpoints>
  ) => mocks.listWalletCheckpoints(...args),
  updateWalletCheckpoint: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: (...args: Parameters<typeof mocks.success>) =>
      mocks.success(...args),
  },
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key,
}));

vi.mock('../../shared/use-finance-confidential-visibility', () => ({
  FINANCE_HIDDEN_AMOUNT: '•••••',
  useFinanceConfidentialVisibility: () => ({
    isConfidential: mocks.isConfidential,
  }),
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

describe('wallet checkpoint UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isConfidential = true;
    mocks.createWalletCheckpointReconciliation.mockResolvedValue({
      checked_at: '2026-06-11T10:00:00.000Z',
      checkpoint_id: 'checkpoint-1',
      created: true,
      offset_amount: -12.34,
      transaction_id: 'tx-1',
      wallet_id: 'wallet-1',
    });
    mocks.createWalletCheckpointBatch.mockResolvedValue({
      data: [],
      totals_by_currency: [],
    });
    mocks.getWalletCheckpointHistory.mockResolvedValue({
      audit_statuses: [],
      checkpoints: [],
      intervals: [],
      latest_checkpoints: [],
      totals_by_currency: [],
      wallets: [],
    });
    mocks.listTransactionCategories.mockResolvedValue([]);
    mocks.listWalletCheckpoints.mockResolvedValue({
      data: [],
      intervals: [],
      latest: null,
    });
  });

  it('masks checkpoint amounts in confidential mode', () => {
    render(<WalletCheckpointAmount amount={123.45} currency="USD" />);

    expect(screen.getByText('•••••')).toBeInTheDocument();
  });

  it('shows checkpoint amounts when confidential mode is disabled', () => {
    mocks.isConfidential = false;

    render(<WalletCheckpointAmount amount={123.45} currency="USD" />);

    expect(screen.getByText('$123.45')).toBeInTheDocument();
  });

  it('saves all-wallet checks with typed decimal values intact', async () => {
    renderWithQueryClient(
      <WalletTotalCheckDialog
        wsId="ws-1"
        canUpdateWallets
        wallets={[
          {
            balance: 0,
            currency: 'USD',
            id: 'wallet-1',
            name: 'Cash',
          },
          {
            balance: 0,
            currency: 'VND',
            id: 'wallet-2',
            name: 'Bank',
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'all_wallet_check' }));
    expect(
      screen.getByRole('button', { name: 'save_checkpoints' })
    ).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText('actual_balance_with_currency:USD'),
      {
        target: { value: '12.3405' },
      }
    );
    fireEvent.change(
      screen.getByLabelText('actual_balance_with_currency:VND'),
      {
        target: { value: '-5000' },
      }
    );
    fireEvent.click(screen.getByRole('button', { name: 'save_checkpoints' }));

    await waitFor(() => {
      expect(mocks.createWalletCheckpointBatch).toHaveBeenCalledWith('ws-1', {
        checked_at: expect.any(String),
        entries: [
          {
            actual_balance: 12.3405,
            wallet_id: 'wallet-1',
          },
          {
            actual_balance: -5000,
            wallet_id: 'wallet-2',
          },
        ],
      });
    });
  });

  it('renders clean and unresolved checkpoint intervals', async () => {
    mocks.listWalletCheckpoints.mockResolvedValue({
      data: [
        {
          actual_balance: 120,
          checked_at: '2026-06-11T10:00:00.000Z',
          created_at: '2026-06-11T10:01:00.000Z',
          created_by: 'user-1',
          currency: 'USD',
          current_ledger_balance: 115,
          current_variance: 5,
          id: 'checkpoint-2',
          ledger_balance: 110,
          note: null,
          original_variance: 10,
          updated_at: '2026-06-11T10:01:00.000Z',
          wallet_id: 'wallet-1',
        },
      ],
      intervals: [
        {
          actual_delta: 10,
          end_actual_balance: 110,
          end_checked_at: '2026-06-10T10:00:00.000Z',
          end_checkpoint_id: 'checkpoint-1',
          interval_variance: 0,
          is_clean: true,
          ledger_delta: 10,
          start_actual_balance: 100,
          start_checked_at: '2026-06-09T10:00:00.000Z',
          start_checkpoint_id: 'checkpoint-0',
          transaction_count: 1,
        },
        {
          actual_delta: 10,
          end_actual_balance: 120,
          end_checked_at: '2026-06-11T10:00:00.000Z',
          end_checkpoint_id: 'checkpoint-2',
          interval_variance: 5,
          is_clean: false,
          ledger_delta: 5,
          start_actual_balance: 110,
          start_checked_at: '2026-06-10T10:00:00.000Z',
          start_checkpoint_id: 'checkpoint-1',
          transaction_count: 2,
        },
      ],
      latest: {
        actual_balance: 120,
        checked_at: '2026-06-11T10:00:00.000Z',
        created_at: '2026-06-11T10:01:00.000Z',
        created_by: 'user-1',
        currency: 'USD',
        current_ledger_balance: 115,
        current_variance: 5,
        id: 'checkpoint-2',
        ledger_balance: 110,
        note: null,
        original_variance: 10,
        updated_at: '2026-06-11T10:01:00.000Z',
        wallet_id: 'wallet-1',
      },
    });

    renderWithQueryClient(
      <WalletCheckpointPanel
        wsId="ws-1"
        walletId="wallet-1"
        walletName="Cash"
        currency="USD"
        canCreateTransactions
        canUpdateWallets
      />
    );

    expect(await screen.findByText('clean')).toBeInTheDocument();
    expect(screen.getByText('unresolved')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'reconcile' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'edit_checkpoint' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'delete_checkpoint' })
    ).toBeInTheDocument();
  });

  it('submits checkpoint reconciliations through the recomputing endpoint', async () => {
    renderWithQueryClient(
      <WalletCheckpointAdjustmentDialog
        wsId="ws-1"
        walletId="wallet-1"
        checkpointId="checkpoint-1"
        walletName="Cash"
        checkedAt="2026-06-11T10:00:00.000Z"
        currency="USD"
        variance={-12.34}
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'reconcile' }));

    await waitFor(() => {
      expect(mocks.createWalletCheckpointReconciliation).toHaveBeenCalledWith(
        'ws-1',
        'wallet-1',
        'checkpoint-1',
        expect.objectContaining({
          category_id: undefined,
          description: expect.stringContaining('Cash'),
        })
      );
    });
  });

  it('renders checkpoint history and submits interval reconciliations with interval basis', async () => {
    mocks.isConfidential = false;
    mocks.getWalletCheckpointHistory.mockResolvedValue({
      audit_statuses: [
        {
          audited_balance: 120,
          checkpoint_ledger_balance: 110,
          latest_actual_balance: 120,
          latest_checked_at: '2026-06-11T10:00:00.000Z',
          latest_checkpoint_id: 'checkpoint-2',
          ledger_balance: 115,
          post_checkpoint_delta: 0,
          post_checkpoint_transaction_count: 0,
          status: 'unresolved',
          variance: 5,
          wallet_id: 'wallet-1',
        },
      ],
      checkpoints: [
        {
          actual_balance: 120,
          checked_at: '2026-06-11T10:00:00.000Z',
          created_at: '2026-06-11T10:01:00.000Z',
          created_by: 'user-1',
          currency: 'USD',
          current_ledger_balance: 115,
          current_variance: 5,
          id: 'checkpoint-2',
          ledger_balance: 110,
          note: 'Audit',
          original_variance: 10,
          updated_at: '2026-06-11T10:01:00.000Z',
          wallet_id: 'wallet-1',
        },
      ],
      intervals: [
        {
          actual_delta: 20,
          currency: 'USD',
          end_actual_balance: 120,
          end_checked_at: '2026-06-11T10:00:00.000Z',
          end_checkpoint_id: 'checkpoint-2',
          interval_variance: 5,
          is_clean: false,
          ledger_delta: 15,
          start_actual_balance: 100,
          start_checked_at: '2026-06-10T10:00:00.000Z',
          start_checkpoint_id: 'checkpoint-1',
          transaction_count: 3,
          wallet_id: 'wallet-1',
          wallet_name: 'Cash',
        },
      ],
      latest_checkpoints: [],
      totals_by_currency: [],
      wallets: [
        {
          balance: 115,
          currency: 'USD',
          icon: null,
          id: 'wallet-1',
          image_src: null,
          name: 'Cash',
          type: 'STANDARD',
        },
      ],
    });

    renderWithQueryClient(
      <WalletCheckpointHistoryDialog
        wsId="ws-1"
        financePrefix="/finance"
        canCreateTransactions
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'checkpoint_history' }));

    expect(await screen.findByText('Cash')).toBeInTheDocument();
    expect(screen.getByText('transaction_count')).toBeInTheDocument();

    const firstReconcileButton = screen.getAllByRole('button', {
      name: 'reconcile',
    })[0];
    if (!firstReconcileButton) {
      throw new Error('Expected a reconcile button');
    }
    fireEvent.click(firstReconcileButton);
    const reconcileButtons = screen.getAllByRole('button', {
      name: 'reconcile',
    });
    const lastReconcileButton = reconcileButtons.at(-1);
    if (!lastReconcileButton) {
      throw new Error('Expected a checkpoint reconcile button');
    }
    fireEvent.click(lastReconcileButton);

    await waitFor(() => {
      expect(mocks.createWalletCheckpointReconciliation).toHaveBeenCalledWith(
        'ws-1',
        'wallet-1',
        'checkpoint-2',
        expect.objectContaining({
          category_id: undefined,
          description: expect.stringContaining('Cash'),
        })
      );
    });
  });
});
