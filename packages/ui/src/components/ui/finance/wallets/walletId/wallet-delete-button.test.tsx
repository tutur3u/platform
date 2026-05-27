import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletDeleteButton } from './wallet-delete-button';

const mocks = vi.hoisted(() => ({
  deleteWallet: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  deleteWallet: (...args: Parameters<typeof mocks.deleteWallet>) =>
    mocks.deleteWallet(...args),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    success: (...args: Parameters<typeof mocks.success>) =>
      mocks.success(...args),
    error: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));

vi.mock('../../finance-route-context', () => ({
  useFinanceHref: () => (path: string) => `/finance${path}`,
}));

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return { invalidateQueries };
}

describe('wallet delete button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteWallet.mockResolvedValue({ message: 'success' });
  });

  it('deletes wallets through the internal API helper', async () => {
    const { invalidateQueries } = renderWithQueryClient(
      <WalletDeleteButton wsId="ws-1" walletId="wallet-1" walletName="Cash" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }));
    const deleteButtons = await screen.findAllByRole('button', {
      name: 'common.delete',
    });
    fireEvent.click(deleteButtons.at(-1)!);

    await waitFor(() => {
      expect(mocks.deleteWallet).toHaveBeenCalledWith('ws-1', 'wallet-1');
      expect(invalidateQueries).toHaveBeenCalledWith({
        predicate: expect.any(Function),
      });
      expect(mocks.push).toHaveBeenCalledWith('/ws-1/finance/wallets');
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });
});
