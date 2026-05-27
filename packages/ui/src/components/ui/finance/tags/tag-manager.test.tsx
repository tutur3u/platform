import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TagManager } from './tag-manager';

const mocks = vi.hoisted(() => ({
  createTransactionTag: vi.fn(),
  deleteTransactionTag: vi.fn(),
  listTransactionTags: vi.fn(),
  routerPush: vi.fn(),
  updateTransactionTag: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  createTransactionTag: (
    ...args: Parameters<typeof mocks.createTransactionTag>
  ) => mocks.createTransactionTag(...args),
  deleteTransactionTag: (
    ...args: Parameters<typeof mocks.deleteTransactionTag>
  ) => mocks.deleteTransactionTag(...args),
  listTransactionTags: (
    ...args: Parameters<typeof mocks.listTransactionTags>
  ) => mocks.listTransactionTags(...args),
  updateTransactionTag: (
    ...args: Parameters<typeof mocks.updateTransactionTag>
  ) => mocks.updateTransactionTag(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, number>) => {
    if (key === 'ws-transaction-tags.transaction_count') {
      return `${values?.count ?? 0} transactions`;
    }

    if (key === 'ws-transaction-tags.transaction_count_short') {
      return `${values?.count ?? 0} tx`;
    }

    if (key === 'ws-transaction-tags.recent_pace_value') {
      return `${values?.count ?? 0} in 30d`;
    }

    return key;
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

function renderTagManager() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TagManager currency="USD" wsId="ws-1" />
    </QueryClientProvider>
  );
}

describe('TagManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    mocks.listTransactionTags.mockResolvedValue([
      {
        id: 'tag-1',
        name: 'RMIT',
        color: '#ec4899',
        description: 'University expenses',
        transaction_count: 3,
        income_count: 1,
        expense_count: 2,
        total_income: 100,
        total_expense: 250,
        net_total: -150,
        recent_transaction_count: 2,
        recent_income_count: 1,
        recent_expense_count: 1,
        recent_total_income: 100,
        recent_total_expense: 50,
        last_transaction_at: '2026-05-23T00:00:00Z',
      },
    ]);
  });

  it('renders RPC-backed income, expense, and recent pace stats for each tag', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=false;path=/';

    renderTagManager();

    await waitFor(() => {
      expect(mocks.listTransactionTags).toHaveBeenCalledWith('ws-1');
    });

    expect(await screen.findByText('RMIT')).toBeVisible();
    expect(screen.getByText('3 transactions')).toBeVisible();
    expect(screen.getByText('+$100.00')).toBeVisible();
    expect(screen.getByText('-$250.00')).toBeVisible();
    expect(screen.getByText('1 tx')).toBeVisible();
    expect(screen.getByText('2 tx')).toBeVisible();
    expect(screen.getByText('2 in 30d')).toBeVisible();
  });

  it('masks tag counts and amounts when finance numbers are hidden', async () => {
    renderTagManager();

    expect(await screen.findByText('RMIT')).toBeVisible();
    expect(
      screen.getByText('ws-transaction-tags.transactions_hidden')
    ).toBeVisible();
    expect(screen.getAllByText('•••••').length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText('+$100.00')).not.toBeInTheDocument();
    expect(screen.queryByText('-$250.00')).not.toBeInTheDocument();
  });
});
