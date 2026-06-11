import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceRouteAuthContext } from '../request-access';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const getWorkspaceConfig = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const linkedUserSingle = vi.fn();
  const linkedTransferToIn = vi.fn();
  const walletIn = vi.fn();
  const adminTransactionSelectIn = vi.fn();
  const adminTransactionUpsert = vi.fn();
  const sessionTransactionWalletIn = vi.fn();
  const transactionInsertSingle = vi.fn();
  const transferInsert = vi.fn();
  const transferDeleteSecondEq = vi.fn();
  const tagInsert = vi.fn();
  const tagDeleteIn = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_linked_users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: linkedUserSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'workspace_members') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(),
              })),
            })),
          })),
        };
      }

      if (table === 'wallet_transactions') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              in: sessionTransactionWalletIn,
            })),
          })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const privateSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_wallets') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: walletIn,
            })),
          })),
        };
      }

      throw new Error(`Unexpected private table: ${table}`);
    }),
  };

  const adminSupabase = {
    schema: vi.fn((schema: string) => {
      if (schema !== 'private') {
        throw new Error(`Unexpected admin schema: ${schema}`);
      }

      return privateSupabase;
    }),
    from: vi.fn((table: string) => {
      if (table === 'wallet_transactions') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: transactionInsertSingle,
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(),
            in: vi.fn(),
          })),
          select: vi.fn(() => ({
            in: adminTransactionSelectIn,
          })),
          upsert: adminTransactionUpsert,
        };
      }

      if (table === 'workspace_wallet_transfers') {
        return {
          insert: transferInsert,
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              in: linkedTransferToIn,
            })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: transferDeleteSecondEq,
            })),
          })),
        };
      }

      if (table === 'wallet_transaction_tags') {
        return {
          delete: vi.fn(() => ({
            in: tagDeleteIn,
          })),
          insert: tagInsert,
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    rpc: vi.fn(),
  };

  return {
    adminSupabase,
    adminTransactionSelectIn,
    adminTransactionUpsert,
    getPermissions,
    getWorkspaceConfig,
    linkedTransferToIn,
    linkedUserSingle,
    normalizeWorkspaceId,
    sessionSupabase,
    sessionTransactionWalletIn,
    tagInsert,
    tagDeleteIn,
    transactionInsertSingle,
    transferDeleteSecondEq,
    transferInsert,
    walletIn,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/utils/workspace-helper')
  >('@tuturuuu/utils/workspace-helper');

  return {
    ...actual,
    getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
      mocks.getPermissions(...args),
    getWorkspaceConfig: (
      ...args: Parameters<typeof mocks.getWorkspaceConfig>
    ) => mocks.getWorkspaceConfig(...args),
    normalizeWorkspaceId: (
      ...args: Parameters<typeof mocks.normalizeWorkspaceId>
    ) => mocks.normalizeWorkspaceId(...args),
    verifyWorkspaceMembershipType: vi.fn(() =>
      Promise.resolve({ ok: true, membershipType: 'MEMBER' as const })
    ),
  };
});

describe('transfers route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000000'
    );
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.getWorkspaceConfig.mockResolvedValue(null);
    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.linkedUserSingle.mockResolvedValue({
      data: {
        virtual_user_id: 'virtual-user-1',
      },
      error: null,
    });
    mocks.walletIn.mockResolvedValue({
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          currency: 'USD',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          currency: 'USD',
        },
      ],
      error: null,
    });
    mocks.linkedTransferToIn.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.adminTransactionSelectIn.mockResolvedValue({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          wallet_id: '11111111-1111-1111-1111-111111111111',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          wallet_id: '22222222-2222-2222-2222-222222222222',
        },
      ],
      error: null,
    });
    mocks.sessionTransactionWalletIn.mockResolvedValue({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          wallet_id: '11111111-1111-1111-1111-111111111111',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          wallet_id: '22222222-2222-2222-2222-222222222222',
        },
      ],
      error: null,
    });
    mocks.adminTransactionUpsert.mockResolvedValue({
      error: null,
    });
    mocks.transferDeleteSecondEq.mockResolvedValue({
      error: null,
    });
    mocks.tagDeleteIn.mockResolvedValue({
      error: null,
    });
    mocks.transactionInsertSingle
      .mockResolvedValueOnce({
        data: {
          id: 'from-tx-1',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: 'to-tx-1',
        },
        error: null,
      });
    mocks.transferInsert.mockResolvedValue({
      error: null,
    });
    mocks.tagInsert.mockResolvedValue({
      error: null,
    });
  });

  it('creates transfer transactions through sbAdmin instead of the request client', async () => {
    const { POST } = await import('./route.js');

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/transfers', {
        method: 'POST',
        body: JSON.stringify({
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
          description: 'Transfer',
          tag_ids: ['33333333-3333-4333-8333-333333333333'],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'success',
      from_transaction_id: 'from-tx-1',
      to_transaction_id: 'to-tx-1',
    });
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith(
      'wallet_transactions'
    );
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith(
      'wallet_transaction_tags'
    );
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalledWith(
      'wallet_transactions'
    );
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalledWith(
      'wallet_transaction_tags'
    );
  });

  it('rejects non-default source wallets on create without wallet override permissions', async () => {
    const { POST } = await import('./route.js');

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_transactions'])
    );

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/transfers', {
        method: 'POST',
        body: JSON.stringify({
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message:
        'Insufficient permissions to override the default wallet for new transactions',
    });
  });

  it('allows create-only wallet override permission for new transfers', async () => {
    const { POST } = await import('./route.js');

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_transactions', 'set_finance_wallets_on_create'])
    );

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/transfers', {
        method: 'POST',
        body: JSON.stringify({
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'success',
      from_transaction_id: 'from-tx-1',
      to_transaction_id: 'to-tx-1',
    });
  });

  it('migrates existing transactions into an id-preserving transfer', async () => {
    const { PATCH } = await import('./route.js');

    const response = await PATCH(
      new Request('http://localhost/api/workspaces/ws-1/transfers', {
        method: 'PATCH',
        body: JSON.stringify({
          origin_transaction_id: '11111111-1111-4111-8111-111111111111',
          destination_transaction_id: '22222222-2222-4222-8222-222222222222',
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
          description: 'Migrated transfer',
          report_opt_in: true,
          tag_ids: ['33333333-3333-4333-8333-333333333333'],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'success',
      from_transaction_id: '11111111-1111-4111-8111-111111111111',
      to_transaction_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(mocks.transferInsert).toHaveBeenCalledWith({
      from_transaction_id: '11111111-1111-4111-8111-111111111111',
      to_transaction_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(mocks.adminTransactionUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: '11111111-1111-4111-8111-111111111111',
          amount: -25,
          category_id: null,
          description: 'Migrated transfer',
          report_opt_in: true,
          wallet_id: '11111111-1111-1111-1111-111111111111',
        }),
        expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          amount: 25,
          category_id: null,
          description: 'Migrated transfer',
          report_opt_in: true,
          wallet_id: '22222222-2222-2222-2222-222222222222',
        }),
      ],
      { onConflict: 'id' }
    );
    expect(mocks.tagDeleteIn).toHaveBeenCalledWith('transaction_id', [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(mocks.tagInsert).toHaveBeenCalledWith([
      {
        transaction_id: '11111111-1111-4111-8111-111111111111',
        tag_id: '33333333-3333-4333-8333-333333333333',
      },
      {
        transaction_id: '22222222-2222-4222-8222-222222222222',
        tag_id: '33333333-3333-4333-8333-333333333333',
      },
    ]);
  });

  it('migrates existing transactions with a resolved finance auth context', async () => {
    const { PATCH } = await import('./route.js');

    const authContext = {
      sbAdmin: mocks.adminSupabase,
      supabase: mocks.sessionSupabase,
      user: {
        aud: 'authenticated',
        email: 'cli-user@tuturuuu.com',
        id: 'cli-user-1',
      },
    } as unknown as FinanceRouteAuthContext;

    const response = await PATCH(
      new Request('http://localhost/api/workspaces/personal/transfers', {
        method: 'PATCH',
        body: JSON.stringify({
          origin_transaction_id: '11111111-1111-4111-8111-111111111111',
          destination_transaction_id: '22222222-2222-4222-8222-222222222222',
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
          description: 'Migrated transfer',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      },
      authContext
    );

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: 'personal',
      user: {
        email: 'cli-user@tuturuuu.com',
        id: 'cli-user-1',
      },
    });
    expect(mocks.transferInsert).toHaveBeenCalledWith({
      from_transaction_id: '11111111-1111-4111-8111-111111111111',
      to_transaction_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(mocks.adminTransactionUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: '11111111-1111-4111-8111-111111111111',
          amount: -25,
          category_id: null,
          description: 'Migrated transfer',
          wallet_id: '11111111-1111-1111-1111-111111111111',
        }),
        expect.objectContaining({
          id: '22222222-2222-4222-8222-222222222222',
          amount: 25,
          category_id: null,
          description: 'Migrated transfer',
          wallet_id: '22222222-2222-2222-2222-222222222222',
        }),
      ],
      { onConflict: 'id' }
    );
  });

  it('rejects transfer migration for an already-linked pair', async () => {
    mocks.linkedTransferToIn.mockResolvedValueOnce({
      data: [
        {
          from_transaction_id: '11111111-1111-4111-8111-111111111111',
          to_transaction_id: '22222222-2222-4222-8222-222222222222',
        },
      ],
      error: null,
    });
    const { PATCH } = await import('./route.js');

    const response = await PATCH(
      new Request('http://localhost/api/workspaces/ws-1/transfers', {
        method: 'PATCH',
        body: JSON.stringify({
          origin_transaction_id: '11111111-1111-4111-8111-111111111111',
          destination_transaction_id: '22222222-2222-4222-8222-222222222222',
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: 'Transfer pair is already linked',
    });
    expect(mocks.adminTransactionUpsert).not.toHaveBeenCalled();
  });

  it('rejects transfer migration with the same transaction id', async () => {
    const { PATCH } = await import('./route.js');

    const response = await PATCH(
      new Request('http://localhost/api/workspaces/ws-1/transfers', {
        method: 'PATCH',
        body: JSON.stringify({
          origin_transaction_id: '11111111-1111-4111-8111-111111111111',
          destination_transaction_id: '11111111-1111-4111-8111-111111111111',
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(mocks.transferInsert).not.toHaveBeenCalled();
  });

  it('rejects cross-currency transfer migration without a destination amount', async () => {
    mocks.walletIn.mockResolvedValueOnce({
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          currency: 'USD',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          currency: 'EUR',
        },
      ],
      error: null,
    });
    const { PATCH } = await import('./route.js');

    const response = await PATCH(
      new Request('http://localhost/api/workspaces/ws-1/transfers', {
        method: 'PATCH',
        body: JSON.stringify({
          origin_transaction_id: '11111111-1111-4111-8111-111111111111',
          destination_transaction_id: '22222222-2222-4222-8222-222222222222',
          origin_wallet_id: '11111111-1111-1111-1111-111111111111',
          destination_wallet_id: '22222222-2222-2222-2222-222222222222',
          amount: 25,
          taken_at: '2026-03-30T08:00:00.000Z',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Destination amount is required for cross-currency transfers',
    });
    expect(mocks.transferInsert).not.toHaveBeenCalled();
  });
});
