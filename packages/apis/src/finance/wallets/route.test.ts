import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  roleMembersEq: vi.fn(),
  roleMembersWorkspaceEq: vi.fn(),
  walletEq: vi.fn(),
  walletIn: vi.fn(),
  walletOrder: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
}));

vi.mock('../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

describe('wallets route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  const createAdminClient = () => ({
    from: vi.fn((table: string) => {
      if (table === 'workspace_role_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: mocks.roleMembersEq,
          }),
        };
      }

      if (table === 'workspace_wallets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: mocks.walletEq,
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.roleMembersEq.mockReturnValue({
      eq: mocks.roleMembersWorkspaceEq,
    });
    mocks.roleMembersWorkspaceEq.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.walletEq.mockReturnValue({
      in: mocks.walletIn,
      order: mocks.walletOrder,
    });
    mocks.walletIn.mockReturnValue({
      order: mocks.walletOrder,
    });
    mocks.walletOrder.mockResolvedValue({
      data: [{ id: 'wallet-default', name: 'Default Wallet' }],
      error: null,
    });
  });

  it('returns the default wallet for invoice creators without wallet roles', async () => {
    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['create_invoices']),
        sbAdmin: createAdminClient(),
        user: {
          id: 'user-1',
        },
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/api/v1/workspaces/ws-1/wallets'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: 'wallet-default', name: 'Default Wallet' },
    ]);
    expect(mocks.walletIn).toHaveBeenCalledWith('id', ['wallet-default']);
  });

  it('returns all wallets for invoice creators when no default wallet is configured', async () => {
    mocks.getWorkspaceConfig.mockResolvedValue(null);
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['create_invoices']),
        sbAdmin: createAdminClient(),
        user: {
          id: 'user-1',
        },
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/api/v1/workspaces/ws-1/wallets'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.roleMembersEq).not.toHaveBeenCalled();
    expect(mocks.walletOrder).toHaveBeenCalledWith('name', {
      ascending: true,
    });
  });
});
