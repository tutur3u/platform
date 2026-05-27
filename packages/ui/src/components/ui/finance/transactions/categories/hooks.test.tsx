import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransactionCategories } from './hooks';

const mocks = vi.hoisted(() => ({
  listTransactionCategories: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  listTransactionCategories: (
    ...args: Parameters<typeof mocks.listTransactionCategories>
  ) => mocks.listTransactionCategories(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('use transaction categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTransactionCategories.mockResolvedValue([
      {
        id: 'income-1',
        name: 'Salary',
        is_expense: false,
        amount: 1000,
      },
      {
        id: 'expense-1',
        name: 'Food',
        is_expense: true,
        amount: 50,
      },
    ]);
  });

  it('loads and filters categories through the internal API helper', async () => {
    const { result } = renderHook(
      () =>
        useTransactionCategories('ws-1', {
          q: 'sal',
          type: 'income',
        }),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.data?.data).toEqual([
        expect.objectContaining({ id: 'income-1' }),
      ]);
    });

    expect(mocks.listTransactionCategories).toHaveBeenCalledWith('ws-1');
  });
});
