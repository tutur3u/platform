import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetAlerts } from './budget-alerts';

const mocks = vi.hoisted(() => ({
  getBudgetStatus: vi.fn(),
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

describe('budget alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBudgetStatus.mockResolvedValue([]);
  });

  it('loads budget status through the internal API helper', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BudgetAlerts wsId="ws-1" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mocks.getBudgetStatus).toHaveBeenCalledWith('ws-1');
    });
  });
});
