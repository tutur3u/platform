import { fireEvent, render, screen } from '@testing-library/react';
import type { Wallet } from '@tuturuuu/types/primitives/Wallet';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { walletColumns } from './columns';

const mocks = vi.hoisted(() => ({
  isConfidential: false,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../shared/use-finance-confidential-visibility', () => ({
  FINANCE_HIDDEN_AMOUNT: 'hidden amount',
  useFinanceConfidentialVisibility: () => ({
    isConfidential: mocks.isConfidential,
  }),
}));

function renderBalanceCell(
  wallet: Wallet,
  balanceMode: 'audited' | 'ledger' = 'audited'
) {
  const columns = walletColumns({
    extraData: {
      balanceMode,
      currency: wallet.currency || 'USD',
    },
    namespace: 'wallet-data-table',
    t: (key: string) => key,
  });
  const balanceColumn = columns.find((column) => column.id === 'balance');

  if (!balanceColumn || typeof balanceColumn.cell !== 'function') {
    throw new Error('Expected balance column cell renderer');
  }

  render(
    balanceColumn.cell({
      row: {
        original: wallet,
      },
    } as never) as ReactElement
  );
}

describe('wallet balance badge rendering', () => {
  beforeEach(() => {
    mocks.isConfidential = false;
  });

  it('suppresses ledger and variance badges for clean checkpoints', () => {
    renderBalanceCell({
      audit_balance: 100,
      audit_status: 'clean',
      audit_variance: 0,
      balance: 100,
      currency: 'USD',
    } as Wallet);

    expect(screen.queryByText('ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('variance')).not.toBeInTheDocument();
  });

  it('shows distinct context badges only while hovering the balance', () => {
    renderBalanceCell({
      audit_balance: 95,
      audit_status: 'unresolved',
      audit_variance: -5,
      balance: 100,
      currency: 'USD',
    } as Wallet);

    expect(screen.queryByText('ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('variance')).not.toBeInTheDocument();

    const trigger = screen
      .getByText('$95.00')
      .closest('[data-wallet-balance-trigger]');
    const balanceBadge = screen
      .getByText('$95.00')
      .closest('[data-wallet-balance-badge="varied"]');

    expect(trigger).not.toBeNull();
    expect(balanceBadge).toHaveClass('text-dynamic-orange');
    fireEvent.mouseEnter(trigger as Element);

    expect(screen.getByText('ledger')).toBeInTheDocument();
    expect(screen.getByText('variance')).toBeInTheDocument();

    expect(
      screen
        .getByText('ledger')
        .closest('[data-wallet-balance-context-badge="ledger"]')
    ).toHaveClass('text-dynamic-blue');
    expect(
      screen
        .getByText('variance')
        .closest('[data-wallet-balance-context-badge="variance"]')
    ).toHaveClass('text-dynamic-purple');

    fireEvent.mouseLeave(trigger as Element);

    expect(screen.queryByText('ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('variance')).not.toBeInTheDocument();
  });

  it('hides all audit amount context when numbers are hidden', () => {
    mocks.isConfidential = true;

    renderBalanceCell({
      audit_balance: 95,
      audit_status: 'unresolved',
      audit_variance: -5,
      balance: 100,
      currency: 'USD',
    } as Wallet);

    expect(screen.getByText('hidden amount')).toBeInTheDocument();
    expect(screen.queryByText('ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('variance')).not.toBeInTheDocument();
  });
});
