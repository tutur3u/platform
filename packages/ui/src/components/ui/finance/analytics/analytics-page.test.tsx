import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from './analytics-page';

const mocks = vi.hoisted(() => ({
  analyticsDateControls: vi.fn(),
  balanceTrendChart: vi.fn(),
  categoryBreakdownChart: vi.fn(),
  filters: vi.fn(),
  incomeExpenseChart: vi.fn(),
  listFinanceIncomeExpenseSummary: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  listFinanceIncomeExpenseSummary: (
    ...args: Parameters<typeof mocks.listFinanceIncomeExpenseSummary>
  ) => mocks.listFinanceIncomeExpenseSummary(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../../../../hooks/use-analytics-filters', () => ({
  useAnalyticsFilters: () => mocks.filters(),
}));

vi.mock('./analytics-date-controls', () => ({
  AnalyticsDateControls: (props: unknown) => {
    mocks.analyticsDateControls(props);
    return <div data-testid="analytics-date-controls" />;
  },
}));

vi.mock('./balance-trend-chart', () => ({
  BalanceTrendChart: (props: unknown) => {
    mocks.balanceTrendChart(props);
    return <div data-testid="balance-trend-chart" />;
  },
}));

vi.mock('../shared/charts/category-breakdown-chart', () => ({
  CategoryBreakdownChart: (props: unknown) => {
    mocks.categoryBreakdownChart(props);
    return <div data-testid="category-breakdown-chart" />;
  },
}));

vi.mock('./income-expense-chart', () => ({
  IncomeExpenseChart: (props: unknown) => {
    mocks.incomeExpenseChart(props);
    return <div data-testid="income-expense-chart" />;
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function mockFilters(interval: 'daily' | 'monthly' = 'daily') {
  mocks.filters.mockReturnValue({
    apiDateRange: {
      endDate: '2026-05-24',
      startDate: '2026-05-01',
    },
    displayRange: 'Last 30 days',
    includeConfidential: true,
    interval,
    preset: '30d',
    setInterval: vi.fn(),
    setPreset: vi.fn(),
    toggleConfidential: vi.fn(),
  });
}

function renderAnalyticsPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AnalyticsPage currency="USD" wsId="ws-1" />
    </QueryClientProvider>
  );
}

describe('analytics page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFilters();
    mocks.listFinanceIncomeExpenseSummary.mockResolvedValue({
      average_expense: 40,
      average_income: 100,
      closing_balance: 60,
      data: [
        {
          period: '2026-05-01',
          total_expense: 40,
          total_income: 100,
        },
      ],
      net_total: 60,
      opening_balance: 0,
      total_expense: 40,
      total_income: 100,
    });
  });

  it('loads analytics through internal API helpers', async () => {
    renderAnalyticsPage();

    await waitFor(() => {
      expect(mocks.listFinanceIncomeExpenseSummary).toHaveBeenCalledWith(
        'ws-1',
        {
          endDate: '2026-05-24',
          includeConfidential: true,
          interval: 'daily',
          startDate: '2026-05-01',
        }
      );
    });

    await waitFor(() => {
      expect(mocks.categoryBreakdownChart).toHaveBeenCalledWith(
        expect.objectContaining({
          includeConfidential: true,
          wsId: 'ws-1',
        })
      );
      expect(mocks.balanceTrendChart).toHaveBeenCalledWith(
        expect.objectContaining({
          endDate: '2026-05-24',
          includeConfidential: true,
          startDate: '2026-05-01',
          wsId: 'ws-1',
        })
      );
    });
  });

  it('maps monthly analytics points into the shared income expense chart', async () => {
    mockFilters('monthly');
    mocks.listFinanceIncomeExpenseSummary.mockResolvedValue({
      average_expense: 400,
      average_income: 1000,
      closing_balance: 600,
      data: [
        {
          period: '2026-05',
          total_expense: 400,
          total_income: 1000,
        },
      ],
      net_total: 600,
      opening_balance: 0,
      total_expense: 400,
      total_income: 1000,
    });

    renderAnalyticsPage();

    await waitFor(() => {
      expect(mocks.incomeExpenseChart).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            {
              day: '2026-05',
              total_expense: 400,
              total_income: 1000,
            },
          ],
          interval: 'monthly',
        })
      );
    });
  });
});
