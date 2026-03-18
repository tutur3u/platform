import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const currencyRateLimit = vi.fn();

  return {
    createClient: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'currency_exchange_rates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: currencyRateLimit,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    })),
    currencyRateLimit,
    getPermissions: vi.fn(),
    getTranslations: vi.fn(),
    getWallet: vi.fn(),
    getWorkspace: vi.fn(),
    getWorkspaceConfig: vi.fn(),
    headers: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error('notFound');
    }),
    withForwardedInternalApiAuth: vi.fn(() => ({ headers: {} })),
  };
});

vi.mock('@tuturuuu/internal-api', () => ({
  getWallet: (...args: Parameters<typeof mocks.getWallet>) =>
    mocks.getWallet(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
}));

vi.mock('next/headers', () => ({
  headers: (...args: Parameters<typeof mocks.headers>) =>
    mocks.headers(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: (...args: Parameters<typeof mocks.getTranslations>) =>
    mocks.getTranslations(...args),
}));

vi.mock('@tuturuuu/ui/custom/feature-summary', () => ({
  default: () => null,
}));

vi.mock('@tuturuuu/ui/finance/transactions/infinite-transactions-list', () => ({
  InfiniteTransactionsList: () => null,
}));

vi.mock('@tuturuuu/ui/separator', () => ({
  Separator: () => null,
}));

vi.mock('@tuturuuu/ui/skeleton', () => ({
  Skeleton: () => null,
}));

vi.mock('../../../card', () => ({
  Card: () => null,
}));

vi.mock('../wallet-icon-display', () => ({
  WalletIconDisplay: () => null,
}));

vi.mock('./credit-wallet-summary', () => ({
  CreditWalletSummary: () => null,
}));

vi.mock('./interest', () => ({
  WalletInterestSection: () => null,
}));

vi.mock('./wallet-details-actions', () => ({
  WalletDetailsActions: () => null,
}));

vi.mock('./wallet-role-access-dialog', () => ({
  default: () => null,
}));

describe('wallet details page', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getWorkspace.mockResolvedValue({ personal: false });
    mocks.getWorkspaceConfig.mockResolvedValue('USD');
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
      containsPermission: vi.fn(() => true),
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getWallet.mockResolvedValue({
      id: 'wallet-1',
      name: 'Primary Wallet',
      type: 'STANDARD',
      currency: 'USD',
      balance: 0,
    });
    mocks.currencyRateLimit.mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('loads wallet details through the internal API helper', async () => {
    const { default: WalletDetailsPageModule } = await import(
      './wallet-details-page.js'
    );
    const WalletDetailsPage = WalletDetailsPageModule as unknown as (props: {
      wsId: string;
      walletId: string;
      searchParams: { q: string; page: string; pageSize: string };
    }) => Promise<unknown>;

    await WalletDetailsPage({
      wsId: 'ws-1',
      walletId: 'wallet-1',
      searchParams: { q: '', page: '1', pageSize: '10' },
    });

    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalled();
    expect(mocks.getWallet).toHaveBeenCalledWith('ws-1', 'wallet-1', {
      headers: {},
    });
  });
});
