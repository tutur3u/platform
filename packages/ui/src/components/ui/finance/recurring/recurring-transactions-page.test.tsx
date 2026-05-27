import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecurringTransactionsPage from './recurring-transactions-page';

const mocks = vi.hoisted(() => ({
  deleteRecurringTransaction: vi.fn(),
  form: vi.fn(),
  listRecurringTransactions: vi.fn(),
  listUpcomingRecurringTransactions: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  deleteRecurringTransaction: (
    ...args: Parameters<typeof mocks.deleteRecurringTransaction>
  ) => mocks.deleteRecurringTransaction(...args),
  listRecurringTransactions: (
    ...args: Parameters<typeof mocks.listRecurringTransactions>
  ) => mocks.listRecurringTransactions(...args),
  listUpcomingRecurringTransactions: (
    ...args: Parameters<typeof mocks.listUpcomingRecurringTransactions>
  ) => mocks.listUpcomingRecurringTransactions(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.date ? `${key}:${values.date}` : key,
}));

vi.mock('./form', () => ({
  RecurringTransactionForm: (props: unknown) => {
    mocks.form(props);
    return null;
  },
}));

function renderRecurringPage(openCreateDialog = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <RecurringTransactionsPage
        currency="USD"
        openCreateDialog={openCreateDialog}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('recurring transactions page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRecurringTransactions.mockResolvedValue([]);
    mocks.listUpcomingRecurringTransactions.mockResolvedValue([]);
  });

  it('loads recurring and upcoming schedules through internal API helpers', async () => {
    renderRecurringPage();

    await waitFor(() => {
      expect(mocks.listRecurringTransactions).toHaveBeenCalledWith('ws-1');
      expect(mocks.listUpcomingRecurringTransactions).toHaveBeenCalledWith(
        'ws-1',
        { daysAhead: 30 }
      );
    });
  });

  it('opens the create form from query state', async () => {
    renderRecurringPage(true);

    await waitFor(() => {
      expect(mocks.form).toHaveBeenCalledWith(
        expect.objectContaining({
          wsId: 'ws-1',
        })
      );
    });
  });
});
