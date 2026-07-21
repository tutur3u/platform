import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionStatistics } from './transaction-statistics';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const stats = {
  totalTransactions: 2,
  totalIncome: 100,
  totalExpense: -40,
  netTotal: 60,
  hasRedactedAmounts: false,
};

function renderTransactionStatistics() {
  return render(
    <TransactionStatistics currency="USD" stats={stats} transactions={[]} />
  );
}

describe('TransactionStatistics', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;Secure';
  });

  it('masks transaction counts and totals when finance numbers are hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/;Secure';

    renderTransactionStatistics();

    expect(screen.getAllByText('•••••').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByText('$100')).not.toBeInTheDocument();
    expect(screen.queryByText('+$60')).not.toBeInTheDocument();
    const netCard = screen
      .getByText('workspace-finance-transactions.net-total')
      .closest('.rounded-xl');
    expect(netCard).toHaveClass('bg-muted/30');
    expect(netCard).not.toHaveClass('bg-dynamic-green/10');
  });

  it('shows transaction counts and totals when finance numbers are visible', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/;Secure';

    renderTransactionStatistics();

    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('$100')).toBeVisible();
    expect(screen.getByText('$40')).toBeVisible();
    expect(screen.getByText('+$60')).toBeVisible();
  });
});
