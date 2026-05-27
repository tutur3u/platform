import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetAlerts } from './budget-alerts';

const mocks = vi.hoisted(() => ({
  getBudgetStatus: vi.fn(),
  useFinanceConfidentialVisibility: vi.fn(() => ({
    isConfidential: false,
  })),
  useFinanceHref: vi.fn(() => (path: string) => `/finance${path}`),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getBudgetStatus: (...args: Parameters<typeof mocks.getBudgetStatus>) =>
    mocks.getBudgetStatus(...args),
}));

vi.mock('../finance-route-context', () => ({
  useFinanceHref: (...args: Parameters<typeof mocks.useFinanceHref>) =>
    mocks.useFinanceHref(...args),
}));

vi.mock('../shared/use-finance-confidential-visibility', () => ({
  FINANCE_HIDDEN_AMOUNT: '•••••',
  useFinanceConfidentialVisibility: (
    ...args: Parameters<typeof mocks.useFinanceConfidentialVisibility>
  ) => mocks.useFinanceConfidentialVisibility(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === 'alert_exceeded_description') {
      return `${values?.spent} / ${values?.amount} / ${values?.percentage}`;
    }

    return values?.name ? `${key}:${values.name}` : key;
  },
}));

function renderBudgetAlerts(currency = 'USD') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BudgetAlerts currency={currency} wsId="ws-1" />
    </QueryClientProvider>
  );
}

describe('budget alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBudgetStatus.mockResolvedValue([]);
    mocks.useFinanceConfidentialVisibility.mockReturnValue({
      isConfidential: false,
    });
  });

  it('loads budget status through the internal API helper', async () => {
    renderBudgetAlerts();

    await waitFor(() => {
      expect(mocks.getBudgetStatus).toHaveBeenCalledWith('ws-1');
    });
  });

  it('masks alert amounts when finance numbers are hidden', async () => {
    mocks.useFinanceConfidentialVisibility.mockReturnValue({
      isConfidential: true,
    });
    mocks.getBudgetStatus.mockResolvedValue([
      {
        amount: '1000000',
        budget_id: 'budget-1',
        budget_name: 'Travel',
        is_near_threshold: false,
        is_over_budget: true,
        percentage_used: 125,
        spent: '1250000',
      },
    ]);

    renderBudgetAlerts('VND');

    expect(
      await screen.findByText('••••• / ••••• / •••••')
    ).toBeInTheDocument();
    expect(screen.queryByText(/1.250.000/)).not.toBeInTheDocument();
  });

  it('formats alert amounts with the supplied workspace currency', async () => {
    mocks.getBudgetStatus.mockResolvedValue([
      {
        amount: '1000000',
        budget_id: 'budget-1',
        budget_name: 'Travel',
        is_near_threshold: false,
        is_over_budget: true,
        percentage_used: 125,
        spent: '1250000',
      },
    ]);

    renderBudgetAlerts('VND');

    const expectedSpent = new Intl.NumberFormat('vi-VN', {
      currency: 'VND',
      style: 'currency',
    }).format(1_250_000);
    const expectedAmount = new Intl.NumberFormat('vi-VN', {
      currency: 'VND',
      style: 'currency',
    }).format(1_000_000);

    const expectedText = `${expectedSpent} / ${expectedAmount} / 125.0`.replace(
      /\s/g,
      ' '
    );

    expect(
      await screen.findByText(
        (content) => content.replace(/\s/g, ' ') === expectedText
      )
    ).toBeInTheDocument();
  });
});
