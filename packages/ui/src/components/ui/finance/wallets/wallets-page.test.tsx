import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  getTranslations: vi.fn(),
  getWorkspace: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  headers: vi.fn(),
  listWallets: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
  withForwardedInternalApiAuth: vi.fn(() => ({ headers: {} })),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  listWallets: (...args: Parameters<typeof mocks.listWallets>) =>
    mocks.listWallets(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
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

vi.mock('@tuturuuu/ui/finance/wallets/form', () => ({
  WalletForm: () => null,
}));

vi.mock('@tuturuuu/ui/finance/wallets/wallets-data-table', () => ({
  WalletsDataTable: () => null,
}));

vi.mock('@tuturuuu/ui/separator', () => ({
  Separator: () => null,
}));

describe('wallets page', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn((permission: string) =>
        ['create_wallets', 'update_wallets', 'delete_wallets'].includes(
          permission
        )
      ),
    });
    mocks.getWorkspaceConfig.mockResolvedValue('USD');
    mocks.getWorkspace.mockResolvedValue({ personal: false });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.listWallets.mockResolvedValue([
      { id: 'wallet-1', name: 'Primary Wallet' },
    ]);
  });

  it('loads wallets through the internal API helper', async () => {
    const { default: WalletsPageModule } = await import('./wallets-page.js');
    const WalletsPage = WalletsPageModule as unknown as (props: {
      wsId: string;
      searchParams: { q: string; page: string; pageSize: string };
      page?: string;
      pageSize?: string;
    }) => Promise<unknown>;

    await WalletsPage({
      wsId: 'ws-1',
      searchParams: { q: '', page: '1', pageSize: '10' },
      page: '1',
      pageSize: '10',
    });

    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalled();
    expect(mocks.listWallets).toHaveBeenCalledWith('ws-1', { headers: {} });
  });
});
