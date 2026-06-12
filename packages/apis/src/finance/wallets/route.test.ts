import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  creditWalletIn: vi.fn(),
  creditWalletSelect: vi.fn(),
  creditWalletUpsert: vi.fn(),
  privateRpc: vi.fn(),
  privateWalletSingle: vi.fn(),
  privateWalletUpsert: vi.fn(),
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
        rpc: mocks.privateRpc,
        from: vi.fn((table: string) => {
          if (table === 'workspace_wallets') {
            return {
              select: vi.fn((columns: string) => {
                mocks.walletSelect(columns);
                return {
                  eq: mocks.walletEq,
                };
              }),
              upsert: mocks.privateWalletUpsert,
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
          upsert: mocks.creditWalletUpsert,
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
    mocks.creditWalletUpsert.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.privateWalletSingle.mockResolvedValue({
      data: {
        id: 'wallet-created',
      },
      error: null,
    });
    mocks.privateWalletUpsert.mockReturnValue({
      select: vi.fn(() => ({
        single: mocks.privateWalletSingle,
      })),
    });
    mocks.privateRpc.mockResolvedValue({
      data: [
        {
          audited_balance: 1200,
          checkpoint_ledger_balance: 1200,
          latest_actual_balance: 1200,
          latest_checked_at: '2026-06-11T00:00:00.000Z',
          latest_checkpoint_id: 'checkpoint-1',
          ledger_balance: 1200,
          post_checkpoint_delta: 0,
          post_checkpoint_transaction_count: 0,
          status: 'clean',
          variance: 0,
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
        audit_balance: 1200,
        audit_checkpoint_id: 'checkpoint-1',
        audit_status: 'clean',
        audit_variance: 0,
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

  it('returns 400 for malformed wallet create JSON before resolving access', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/wallets', {
        method: 'POST',
        body: '{',
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Malformed JSON request body',
    });
    expect(mocks.getFinanceRouteContext).not.toHaveBeenCalled();
  });

  it('requires positive credit metadata for credit wallet creation', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/wallets', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Rewards Card',
          currency: 'USD',
          type: 'CREDIT',
          limit: 0,
          statement_date: 0,
          payment_date: 32,
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: 'Invalid wallet data',
        errors: expect.arrayContaining([
          expect.objectContaining({ path: ['limit'] }),
          expect.objectContaining({ path: ['statement_date'] }),
          expect.objectContaining({ path: ['payment_date'] }),
        ]),
      })
    );
    expect(mocks.getFinanceRouteContext).not.toHaveBeenCalled();
  });

  it('ignores credit fields for standard wallet creation', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['create_wallets']),
        sbAdmin: createAdminClient(),
        user: {
          id: 'user-1',
        },
      },
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/wallets', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Cash',
          currency: 'USD',
          type: 'STANDARD',
          limit: 3000,
          statement_date: 1,
          payment_date: 15,
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.privateWalletUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        currency: 'USD',
        name: 'Cash',
        type: 'STANDARD',
        ws_id: 'ws-1',
      }),
    ]);
    expect(mocks.creditWalletUpsert).not.toHaveBeenCalled();
  });

  it('upserts credit metadata for credit wallet creation', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['create_wallets']),
        sbAdmin: createAdminClient(),
        user: {
          id: 'user-1',
        },
      },
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      new Request('http://localhost/api/v1/workspaces/ws-1/wallets', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Rewards Card',
          currency: 'USD',
          type: 'CREDIT',
          limit: 5000,
          statement_date: 3,
          payment_date: 25,
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.creditWalletUpsert).toHaveBeenCalledWith({
      wallet_id: 'wallet-created',
      statement_date: 3,
      payment_date: 25,
      limit: 5000,
    });
  });
});
