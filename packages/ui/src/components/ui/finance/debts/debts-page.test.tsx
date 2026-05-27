import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebtsPage } from './debts-page';

const mocks = vi.hoisted(() => ({
  debtLoanForm: vi.fn(),
  getDebtLoanSummary: vi.fn(),
  listDebtLoans: vi.fn(),
  listWallets: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  getDebtLoanSummary: (...args: Parameters<typeof mocks.getDebtLoanSummary>) =>
    mocks.getDebtLoanSummary(...args),
  listDebtLoans: (...args: Parameters<typeof mocks.listDebtLoans>) =>
    mocks.listDebtLoans(...args),
  listWallets: (...args: Parameters<typeof mocks.listWallets>) =>
    mocks.listWallets(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./debt-loan-form', () => ({
  DebtLoanForm: (props: unknown) => {
    mocks.debtLoanForm(props);
    return null;
  },
}));

vi.mock('./debt-loan-list', () => ({
  DebtLoanList: () => null,
}));

vi.mock('./debt-loan-summary', () => ({
  DebtLoanSummaryCards: () => null,
}));

function renderDebtsPage(
  searchParams: { create?: string; type?: string } = {}
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
      <DebtsPage wsId="ws-1" searchParams={searchParams} />
    </QueryClientProvider>
  );
}

describe('debts page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDebtLoanSummary.mockResolvedValue({
      active_debt_count: 0,
      active_loan_count: 0,
      net_position: 0,
      total_debt_remaining: 0,
      total_debts: 0,
      total_loan_remaining: 0,
      total_loans: 0,
    });
    mocks.listDebtLoans.mockResolvedValue([]);
    mocks.listWallets.mockResolvedValue([]);
  });

  it('loads debts, summary, and wallets through internal API helpers', async () => {
    renderDebtsPage();

    await waitFor(() => {
      expect(mocks.getDebtLoanSummary).toHaveBeenCalledWith('ws-1');
      expect(mocks.listDebtLoans).toHaveBeenCalledWith('ws-1', {});
      expect(mocks.listWallets).toHaveBeenCalledWith('ws-1');
    });
  });

  it('opens the loan create dialog from query state', async () => {
    renderDebtsPage({ create: 'loan' });

    await waitFor(() => {
      expect(mocks.debtLoanForm).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultType: 'loan',
          wsId: 'ws-1',
        })
      );
    });
  });
});
