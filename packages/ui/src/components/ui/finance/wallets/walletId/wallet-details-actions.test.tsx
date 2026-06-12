import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletDetailsActions } from './wallet-details-actions';

const mocks = vi.hoisted(() => ({
  transactionForm: vi.fn((_props: unknown) => null),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/custom/modifiable-dialog-trigger', () => ({
  default: ({ form, open }: { form?: ReactNode; open?: boolean }) =>
    open ? <div data-testid="dialog">{form}</div> : null,
}));

vi.mock('@tuturuuu/ui/finance/transactions/form', () => ({
  TransactionForm: (...args: Parameters<typeof mocks.transactionForm>) =>
    mocks.transactionForm(...args),
}));

vi.mock('@tuturuuu/ui/finance/wallets/form', () => ({
  WalletForm: () => null,
}));

vi.mock('./wallet-delete-button', () => ({
  WalletDeleteButton: () => null,
}));

describe('WalletDetailsActions', () => {
  const baseProps = {
    wsId: 'ws-1',
    walletId: 'wallet-1',
    wallet: {
      id: 'wallet-1',
      name: 'Rewards Card',
      type: 'CREDIT',
    } as never,
    canUpdateWallets: true,
    canCreateTransactions: true,
    canCreateConfidentialTransactions: true,
    canDeleteWallets: false,
    isPersonalWorkspace: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills card payments as transfers into the credit wallet', () => {
    render(<WalletDetailsActions {...baseProps} />);

    fireEvent.click(screen.getByText('wallet-data-table.credit_payment'));

    expect(mocks.transactionForm).toHaveBeenCalled();
    const props = mocks.transactionForm.mock.calls.at(-1)?.[0];

    expect(props).toEqual(
      expect.objectContaining({
        initialMode: 'transfer',
        initialTransfer: expect.objectContaining({
          destination_wallet_id: 'wallet-1',
        }),
      })
    );
  });

  it('prefills card charges as expense transactions on the credit wallet', () => {
    render(<WalletDetailsActions {...baseProps} />);

    fireEvent.click(screen.getByText('wallet-data-table.credit_charge'));

    const props = mocks.transactionForm.mock.calls.at(-1)?.[0];

    expect(props).toEqual(
      expect.objectContaining({
        initialMode: 'transaction',
        initialTransaction: expect.objectContaining({
          categoryKind: 'expense',
          origin_wallet_id: 'wallet-1',
        }),
      })
    );
  });

  it('prefills card credits as income transactions on the credit wallet', () => {
    render(<WalletDetailsActions {...baseProps} />);

    fireEvent.click(screen.getByText('wallet-data-table.credit_refund'));

    const props = mocks.transactionForm.mock.calls.at(-1)?.[0];

    expect(props).toEqual(
      expect.objectContaining({
        initialMode: 'transaction',
        initialTransaction: expect.objectContaining({
          categoryKind: 'income',
          origin_wallet_id: 'wallet-1',
        }),
      })
    );
  });
});
