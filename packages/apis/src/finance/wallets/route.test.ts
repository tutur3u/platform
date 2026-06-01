import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  creditWalletIn: vi.fn(),
  creditWalletSelect: vi.fn(),
  roleMembersEq: vi.fn(),
  roleMembersWorkspaceEq: vi.fn(),
  walletEq: vi.fn(),
  walletIn: vi.fn(),
  walletOrder: vi.fn(),
  walletSelect: vi.fn(),
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
    schema: vi.fn((schema: string) => {
      if (schema !== 'private') {
        throw new Error(`Unexpected schema: ${schema}`);
      }

      return {
        from: vi.fn((table: string) => {
          if (table === 'workspace_wallets') {
            return {
              select: vi.fn((columns: string) => {
                mocks.walletSelect(columns);
                return {
                  eq: mocks.walletEq,
                };
              }),
            };
          }

          throw new Error(`Unexpected private table: ${table}`);
        }),
      };
    }),
    from: vi.fn((table: string) => {
      if (table === 'workspace_role_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: mocks.roleMembersEq,
          }),
        };
      }

      if (table === 'credit_wallets') {
        return {
          select: vi.fn((columns: string) => {
            mocks.creditWalletSelect(columns);
            return {
              in: mocks.creditWalletIn,
            };
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
    mocks.creditWalletIn.mockResolvedValue({
      data: [
        {
          limit: 5000,
          payment_date: 15,
          statement_date: 1,
          wallet_id: 'wallet-default',
        },
      ],
      error: null,
    });
    mocks.walletEq.mockReturnValue({
      in: mocks.walletIn,
      order: mocks.walletOrder,
    });
    mocks.walletIn.mockReturnValue({
      order: mocks.walletOrder,
    });
    mocks.walletOrder.mockImplementation(async () => {
      const selectedColumns = mocks.walletSelect.mock.calls.at(-1)?.[0];

      return {
        data:
          selectedColumns === 'id,name,type,currency,icon,image_src'
            ? [
                {
                  currency: 'USD',
                  icon: null,
                  id: 'wallet-default',
                  image_src: null,
                  name: 'Default Wallet',
                  type: 'CASH',
                },
              ]
            : [
                {
                  balance: 1200,
                  currency: 'USD',
                  id: 'wallet-default',
                  name: 'Default Wallet',
                  type: 'CREDIT',
                },
              ],
        error: null,
      };
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
      {
        currency: 'USD',
        icon: null,
        id: 'wallet-default',
        image_src: null,
        name: 'Default Wallet',
        type: 'CASH',
      },
    ]);
    expect(mocks.walletSelect).toHaveBeenCalledWith(
      'id,name,type,currency,icon,image_src'
    );
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
    expect(mocks.walletSelect).toHaveBeenCalledWith(
      'id,name,type,currency,icon,image_src'
    );
    expect(mocks.walletOrder).toHaveBeenCalledWith('name', {
      ascending: true,
    });
  });

  it('returns full wallet fields for finance managers', async () => {
    mocks.getWorkspaceConfig.mockResolvedValue(null);
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['manage_finance']),
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
      expect.objectContaining({
        balance: 1200,
        limit: 5000,
        payment_date: 15,
        statement_date: 1,
      }),
    ]);
    expect(mocks.walletSelect).toHaveBeenCalledWith('*');
    expect(mocks.creditWalletSelect).toHaveBeenCalledWith(
      'wallet_id, limit, statement_date, payment_date'
    );
    expect(mocks.creditWalletIn).toHaveBeenCalledWith('wallet_id', [
      'wallet-default',
    ]);
  });
});
