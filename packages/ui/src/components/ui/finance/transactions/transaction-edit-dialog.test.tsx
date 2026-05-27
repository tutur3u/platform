import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionEditDialog } from './transaction-edit-dialog';

const mocks = vi.hoisted(() => ({
  listTransactionCategories: vi.fn(),
  listTransactionTagLinks: vi.fn(),
  listTransactionTags: vi.fn(),
  listWallets: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  createTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  listTransactionCategories: (
    ...args: Parameters<typeof mocks.listTransactionCategories>
  ) => mocks.listTransactionCategories(...args),
  listTransactionTagLinks: (
    ...args: Parameters<typeof mocks.listTransactionTagLinks>
  ) => mocks.listTransactionTagLinks(...args),
  listTransactionTags: (
    ...args: Parameters<typeof mocks.listTransactionTags>
  ) => mocks.listTransactionTags(...args),
  listWallets: (...args: Parameters<typeof mocks.listWallets>) =>
    mocks.listWallets(...args),
  updateTransaction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/image', () => ({
  default: () => null,
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionEditDialog
        canUpdateTransactions
        currency="USD"
        isOpen
        onClose={vi.fn()}
        transaction={
          {
            amount: 123,
            category_id: 'category-1',
            description: 'Salary',
            id: 'transaction-1',
            report_opt_in: true,
            taken_at: '2026-05-27T00:00:00.000Z',
            wallet_id: 'wallet-1',
          } as never
        }
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('TransactionEditDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/suspicious/noDocumentCookie: test resets the finance visibility cookie.
    document.cookie =
      'finance-confidential-mode=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    mocks.listTransactionCategories.mockResolvedValue([
      { id: 'category-1', is_expense: false, name: 'Income' },
    ]);
    mocks.listTransactionTagLinks.mockResolvedValue([]);
    mocks.listTransactionTags.mockResolvedValue([]);
    mocks.listWallets.mockResolvedValue([
      { currency: 'USD', id: 'wallet-1', name: 'Main' },
    ]);
  });

  it('masks the summary amount when finance numbers are globally hidden', async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: test sets the finance visibility cookie.
    document.cookie = 'finance-confidential-mode=true;path=/';

    renderDialog();

    expect(await screen.findByText('•••••')).toBeVisible();
    expect(screen.queryByText('+$123')).not.toBeInTheDocument();
  });
});
