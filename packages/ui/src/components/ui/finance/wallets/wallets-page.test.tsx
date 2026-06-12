import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDialogFeatureSummary: vi.fn((_props: unknown) => null),
  getPermissions: vi.fn(),
  getTranslations: vi.fn(),
  getWorkspace: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
  walletCheckpointHistoryDialog: vi.fn((_props: unknown) => null),
  walletForm: vi.fn((_props: unknown) => null),
  walletTotalCheckDialog: vi.fn((_props: unknown) => null),
  walletsDataTable: vi.fn((_props: unknown) => null),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
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

vi.mock('@tuturuuu/ui/finance/shared/create-dialog-feature-summary', () => ({
  CreateDialogFeatureSummary: (
    ...args: Parameters<typeof mocks.createDialogFeatureSummary>
  ) => mocks.createDialogFeatureSummary(...args),
}));

vi.mock('@tuturuuu/ui/finance/shared/balance-mode-toggle', () => ({
  FinanceBalanceModeToggle: () => null,
}));

vi.mock('@tuturuuu/ui/finance/shared/numbers-visibility-toggle', () => ({
  FinanceNumbersVisibilityToggle: () => null,
}));

vi.mock(
  '@tuturuuu/ui/finance/wallets/checkpoints/wallet-checkpoint-history-dialog',
  () => ({
    WalletCheckpointHistoryDialog: (
      ...args: Parameters<typeof mocks.walletCheckpointHistoryDialog>
    ) => mocks.walletCheckpointHistoryDialog(...args),
  })
);

vi.mock(
  '@tuturuuu/ui/finance/wallets/checkpoints/wallet-total-check-dialog',
  () => ({
    WalletTotalCheckDialog: (
      ...args: Parameters<typeof mocks.walletTotalCheckDialog>
    ) => mocks.walletTotalCheckDialog(...args),
  })
);

vi.mock('@tuturuuu/ui/finance/wallets/form', () => ({
  WalletForm: (...args: Parameters<typeof mocks.walletForm>) =>
    mocks.walletForm(...args),
}));

vi.mock('@tuturuuu/ui/finance/wallets/wallets-data-table', () => ({
  WalletsDataTable: (...args: Parameters<typeof mocks.walletsDataTable>) =>
    mocks.walletsDataTable(...args),
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
        [
          'create_transactions',
          'create_wallets',
          'update_wallets',
          'delete_wallets',
        ].includes(permission)
      ),
    });
    mocks.getWorkspaceConfig.mockResolvedValue('USD');
    mocks.getWorkspace.mockResolvedValue({ personal: false });
  });

  it('passes wallet controls and the search query to the infinite table', async () => {
    const { default: WalletsPageModule } = await import('./wallets-page.js');
    const WalletsPage = WalletsPageModule as unknown as (props: {
      wsId: string;
      searchParams: { q: string };
    }) => Promise<unknown>;

    const element = await WalletsPage({
      wsId: 'ws-1',
      searchParams: { q: 'bank' },
    });

    render(element as ReactElement);

    expect(mocks.walletsDataTable).toHaveBeenCalledWith(
      expect.objectContaining({
        canDeleteWallets: true,
        canUpdateWallets: true,
        currency: 'USD',
        financePrefix: '/finance',
        isPersonalWorkspace: false,
        query: 'bank',
        wsId: 'ws-1',
      }),
      undefined
    );
    expect(mocks.walletTotalCheckDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        canUpdateWallets: true,
        currency: 'USD',
        wsId: 'ws-1',
      }),
      undefined
    );
    expect(mocks.walletCheckpointHistoryDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        canCreateTransactions: true,
        financePrefix: '/finance',
        wsId: 'ws-1',
      }),
      undefined
    );
  });

  it('opens wallet creation in credit-card mode from search params', async () => {
    const { default: WalletsPageModule } = await import('./wallets-page.js');
    const WalletsPage = WalletsPageModule as unknown as (props: {
      wsId: string;
      searchParams: {
        create?: string;
        q: string;
      };
    }) => Promise<ReactElement>;

    const element = await WalletsPage({
      wsId: 'ws-1',
      searchParams: {
        create: 'credit-card',
        q: '',
      },
    });

    render(element);

    const createDialogProps =
      mocks.createDialogFeatureSummary.mock.calls[0]?.[0];

    expect(createDialogProps).toEqual(
      expect.objectContaining({
        defaultOpen: true,
      })
    );
    const form = (createDialogProps as { form?: ReactElement }).form;

    expect(form?.props).toEqual(
      expect.objectContaining({
        defaultType: 'CREDIT',
      })
    );
  });
});
