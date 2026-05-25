import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletFilter } from './wallet-filter';

const mocks = vi.hoisted(() => ({
  listWallets: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/finance', () => ({
  listWallets: (...args: Parameters<typeof mocks.listWallets>) =>
    mocks.listWallets(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function renderWalletFilter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <WalletFilter
        wsId="ws-1"
        selectedWalletIds={[]}
        onWalletsChange={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe('wallet filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWallets.mockResolvedValue([]);
  });

  it('loads wallets through the internal API helper', async () => {
    renderWalletFilter();

    await waitFor(() => {
      expect(mocks.listWallets).toHaveBeenCalledWith('ws-1');
    });
  });
});
