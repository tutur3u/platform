import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const linkedUserSingle = vi.fn();
  const walletIn = vi.fn();
  const transactionInsertSingle = vi.fn();
  const transferInsert = vi.fn();
  const tagInsert = vi.fn();

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

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
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
            in: vi.fn(),
          })),
        };
      }

      if (table === 'workspace_wallet_transfers') {
        return {
          insert: transferInsert,
        };
      }

      if (table === 'wallet_transaction_tags') {
        return {
          insert: tagInsert,
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    rpc: vi.fn(),
  };

  return {
    adminSupabase,
    getPermissions,
    linkedUserSingle,
    normalizeWorkspaceId,
    sessionSupabase,
    tagInsert,
    transactionInsertSingle,
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
    normalizeWorkspaceId: (
      ...args: Parameters<typeof mocks.normalizeWorkspaceId>
    ) => mocks.normalizeWorkspaceId(...args),
  };
});

describe('transfers route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.normalizeWorkspaceId.mockResolvedValue(
      '00000000-0000-0000-0000-000000000000'
    );
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
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
});
