import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebtsPage } from './debts-page';

const mocks = vi.hoisted(() => ({
  debtLoanForm: vi.fn(),
  debtLoanList: vi.fn(),
  debtLoanSummaryCards: vi.fn(),
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
  DebtLoanList: (props: unknown) => {
    mocks.debtLoanList(props);
    return null;
  },
}));

vi.mock('./debt-loan-summary', () => ({
  DebtLoanSummaryCards: (props: unknown) => {
    mocks.debtLoanSummaryCards(props);
    return null;
  },
}));

function renderDebtsPage(
  searchParams: { create?: string; type?: string } = {},
  props: { currency?: string } = {}
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
      <DebtsPage
        wsId="ws-1"
        searchParams={searchParams}
        currency={props.currency}
      />
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
    renderDebtsPage({ create: 'loan' }, { currency: 'SGD' });

    await waitFor(() => {
      expect(mocks.debtLoanForm).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultCurrency: 'SGD',
          defaultType: 'loan',
          wsId: 'ws-1',
        })
      );
    });
  });

  it('passes workspace currency to summary without overriding list row currencies', async () => {
    mocks.listDebtLoans.mockResolvedValueOnce([
      {
        currency: 'USD',
        id: 'debt-1',
        name: 'USD Debt',
        status: 'active',
        type: 'debt',
      },
    ]);

    renderDebtsPage({}, { currency: 'SGD' });

    await waitFor(() => {
      expect(mocks.debtLoanSummaryCards).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'SGD',
          locale: 'en-SG',
        })
      );
      expect(mocks.debtLoanList).toHaveBeenCalledWith(
        expect.not.objectContaining({
          currency: expect.anything(),
        })
      );
      expect(mocks.debtLoanList).toHaveBeenCalledWith(
        expect.objectContaining({
          debtLoans: expect.arrayContaining([
            expect.objectContaining({ currency: 'USD' }),
          ]),
        })
      );
    });
  });
});
