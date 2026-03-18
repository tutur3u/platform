import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BudgetsPage from './budgets-page';

const mocks = vi.hoisted(() => ({
  deleteBudget: vi.fn(),
  listBudgets: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  deleteBudget: (...args: Parameters<typeof mocks.deleteBudget>) =>
    mocks.deleteBudget(...args),
  listBudgets: (...args: Parameters<typeof mocks.listBudgets>) =>
    mocks.listBudgets(...args),
}));

vi.mock('./form', () => ({
  BudgetForm: () => null,
}));

describe('budgets page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBudgets.mockResolvedValue([]);
  });

  it('loads budgets through the internal API helper', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BudgetsPage
          wsId="ws-1"
          currency="USD"
          searchParams={{ q: '', page: '1', pageSize: '10' }}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mocks.listBudgets).toHaveBeenCalledWith('ws-1');
    });
  });
});
