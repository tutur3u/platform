import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WalletDetailsAmount } from './wallet-details-amount';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../shared/use-finance-balance-mode', () => ({
  useFinanceBalanceMode: () => ({
    mode: 'audited',
  }),
}));

vi.mock('../../shared/use-finance-confidential-visibility', () => ({
  FINANCE_HIDDEN_AMOUNT: 'hidden amount',
  useFinanceConfidentialVisibility: () => ({
    isConfidential: false,
  }),
}));

describe('WalletDetailsAmount', () => {
  it('uses an orange balance badge and compact context badges for varied wallets', () => {
    render(
      <WalletDetailsAmount
        auditedBalance={95}
        auditStatus="unresolved"
        auditVariance={-5}
        currency="USD"
        ledgerBalance={100}
        primary="$100.00"
      />
    );

    expect(
      screen
        .getByText('$95.00')
        .closest('[data-wallet-details-balance-badge="varied"]')
    ).toHaveClass('text-dynamic-orange');
    expect(screen.getByText('ledger')).toBeInTheDocument();
    expect(screen.getByText('variance')).toBeInTheDocument();
  });

  it('suppresses audit context for clean checkpoints', () => {
    render(
      <WalletDetailsAmount
        auditedBalance={100}
        auditStatus="clean"
        auditVariance={0}
        currency="USD"
        ledgerBalance={100}
        primary="$100.00"
      />
    );

    expect(screen.queryByText('ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('variance')).not.toBeInTheDocument();
    expect(
      screen
        .getByText('$100.00')
        .closest('[data-wallet-details-balance-badge="varied"]')
    ).not.toBeInTheDocument();
  });
});
