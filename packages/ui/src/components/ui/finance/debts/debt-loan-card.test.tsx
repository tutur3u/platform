import { render, screen } from '@testing-library/react';
import type { DebtLoanWithBalance } from '@tuturuuu/types/primitives/DebtLoan';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebtLoanCard } from './debt-loan-card';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

const debtLoan = {
  id: 'debt-1',
  ws_id: 'ws-1',
  name: 'Tuition loan',
  description: null,
  counterparty: 'RMIT',
  type: 'debt',
  principal_amount: 1000,
  currency: 'USD',
  interest_rate: 5,
  interest_type: 'simple',
  start_date: '2026-05-01',
  due_date: '2026-12-01',
  status: 'active',
  wallet_id: 'wallet-1',
  creator_id: 'user-1',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  total_paid: 250,
  total_interest_paid: 0,
  remaining_balance: 750,
  progress_percentage: 25,
} satisfies DebtLoanWithBalance;

function renderDebtLoanCard() {
  return render(<DebtLoanCard debtLoan={debtLoan} wsId="ws-1" />);
}

describe('DebtLoanCard', () => {
  beforeEach(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  });

  it('masks amounts, progress, and interest rate when finance numbers are hidden', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/';

    const { container } = renderDebtLoanCard();

    expect(screen.getAllByText('•••••').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('25.0% completed')).not.toBeInTheDocument();
    expect(screen.queryByText('5%/year')).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="progress-indicator"]')
    ).toHaveStyle('transform: translateX(-100%)');
  });

  it('shows amounts, progress, and interest rate when finance numbers are visible', () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/';

    const { container } = renderDebtLoanCard();

    expect(screen.getByText('$1,000.00')).toBeVisible();
    expect(screen.getByText('$250.00')).toBeVisible();
    expect(screen.getByText('$750.00')).toBeVisible();
    expect(screen.getByText('25.0% completed')).toBeVisible();
    expect(screen.getByText('5%/year')).toBeVisible();
    expect(
      container.querySelector('[data-slot="progress-indicator"]')
    ).toHaveStyle('transform: translateX(-75%)');
  });
});
