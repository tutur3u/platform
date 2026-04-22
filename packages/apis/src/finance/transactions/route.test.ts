import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const getWorkspaceConfig = vi.fn();
  const getUser = vi.fn();
  const linkedUserSingle = vi.fn();
  const walletMaybeSingle = vi.fn();
  const transactionSingle = vi.fn();
  const tagInsert = vi.fn();
  const transactionRpc = vi.fn();
  const transactionTagsIn = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser,
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
    rpc: transactionRpc,
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_wallets') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: walletMaybeSingle,
              })),
            })),
          })),
        };
      }

      if (table === 'wallet_transactions') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: transactionSingle,
            })),
          })),
        };
      }

      if (table === 'wallet_transaction_tags') {
        return {
          insert: tagInsert,
          select: vi.fn(() => ({
            in: transactionTagsIn,
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    rpc: vi.fn(),
  };

  return {
    adminSupabase,
    getPermissions,
    getWorkspaceConfig,
    linkedUserSingle,
    sessionSupabase,
    tagInsert,
    transactionRpc,
    transactionTagsIn,
    transactionSingle,
    walletMaybeSingle,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
  verifyWorkspaceMembershipType: vi.fn(() =>
    Promise.resolve({ ok: true, membershipType: 'MEMBER' as const })
  ),
}));

describe('transactions route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

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
    mocks.walletMaybeSingle.mockResolvedValue({
      data: {
        id: 'wallet-1',
      },
      error: null,
    });
    mocks.transactionSingle.mockResolvedValue({
      data: {
        id: 'transaction-1',
      },
      error: null,
    });
    mocks.tagInsert.mockResolvedValue({
      error: null,
    });
    mocks.transactionRpc.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.transactionTagsIn.mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('returns transactions enriched with tags', async () => {
    const { GET } = await import('./route.js');

    mocks.transactionRpc.mockResolvedValue({
      data: [
        {
          id: 'transaction-1',
          amount: -150,
          taken_at: '2026-03-30T08:00:00.000Z',
          description: 'Lunch',
        },
      ],
      error: null,
    });
    mocks.transactionTagsIn.mockResolvedValue({
      data: [
        {
          transaction_id: 'transaction-1',
          transaction_tags: {
            id: 'tag-1',
            name: 'Food',
            color: '#ff0000',
          },
        },
      ],
      error: null,
    });

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/00000000-0000-0000-0000-000000000000/transactions?page=1&itemsPerPage=25'
      ),
      {
        params: Promise.resolve({
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'transaction-1',
        tags: [
          {
            id: 'tag-1',
            name: 'Food',
            color: '#ff0000',
          },
        ],
      }),
    ]);
  });

  it('creates transactions and tags through sbAdmin after permission checks', async () => {
    const { POST } = await import('./route.js');

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          amount: 150,
          origin_wallet_id: '3c9a5c7f-4f0d-4f15-9477-cbf1c7bc7445',
          taken_at: '2026-03-30T08:00:00.000Z',
          description: 'Lunch',
          tag_ids: ['d7d55de5-0ea8-4e9a-92dc-9a6e13f0a30c'],
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
    await expect(response.json()).resolves.toEqual({ message: 'success' });
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

  it('rejects non-default wallet selection on create without wallet override permissions', async () => {
    const { POST } = await import('./route.js');

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_transactions'])
    );

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          amount: 150,
          origin_wallet_id: '3c9a5c7f-4f0d-4f15-9477-cbf1c7bc7445',
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

  it('allows create-only wallet override permission to bypass the default wallet lock on create', async () => {
    const { POST } = await import('./route.js');

    mocks.getWorkspaceConfig.mockResolvedValue('wallet-default');
    mocks.getPermissions.mockResolvedValue(
      withPermissions(['create_transactions', 'set_finance_wallets_on_create'])
    );

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          amount: 150,
          origin_wallet_id: '3c9a5c7f-4f0d-4f15-9477-cbf1c7bc7445',
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
    await expect(response.json()).resolves.toEqual({ message: 'success' });
  });
});
