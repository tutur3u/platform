import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const verifyWorkspaceSingle = vi.fn();
  const confidentialSingle = vi.fn();
  const linkedTransactionMaybeSingle = vi.fn();
  const walletMaybeSingle = vi.fn();
  const transactionTagsIn = vi.fn();
  const deleteEq = vi.fn();
  const updateEq = vi.fn();
  const tagDeleteEq = vi.fn();
  const tagInsert = vi.fn();
  const getPermissions = vi.fn();
  const getUser = vi.fn();
  const transactionRpc = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser,
    },
    from: vi.fn(),
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

      if (table === 'wallet_transaction_tags') {
        return {
          select: vi.fn(() => ({
            in: transactionTagsIn,
          })),
          delete: vi.fn(() => ({
            eq: tagDeleteEq,
          })),
          insert: tagInsert,
        };
      }

      if (table !== 'wallet_transactions') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: vi.fn((query: string) => {
          if (query.includes('workspace_wallets!wallet_id')) {
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: verifyWorkspaceSingle,
                })),
              })),
            };
          }

          return {
            eq: vi.fn(() => ({
              single: confidentialSingle,
              maybeSingle: linkedTransactionMaybeSingle,
            })),
          };
        }),
        delete: vi.fn(() => ({
          eq: deleteEq,
        })),
        update: vi.fn(() => ({
          eq: updateEq,
        })),
      };
    }),
  };

  return {
    adminSupabase,
    confidentialSingle,
    deleteEq,
    getPermissions,
    getUser,
    linkedTransactionMaybeSingle,
    sessionSupabase,
    tagDeleteEq,
    tagInsert,
    transactionRpc,
    transactionTagsIn,
    updateEq,
    verifyWorkspaceSingle,
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
  verifyWorkspaceMembershipType: vi.fn(() =>
    Promise.resolve({ ok: true, membershipType: 'MEMBER' as const })
  ),
}));

describe('transaction detail route', () => {
  const firstTagId = '11111111-1111-4111-8111-111111111111';
  const secondTagId = '22222222-2222-4222-8222-222222222222';
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
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.verifyWorkspaceSingle.mockResolvedValue({
      data: {
        id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
        workspace_wallets: {
          ws_id: '00000000-0000-0000-0000-000000000000',
        },
      },
      error: null,
    });
    mocks.confidentialSingle.mockResolvedValue({
      data: {
        is_amount_confidential: false,
        is_description_confidential: false,
        is_category_confidential: false,
      },
      error: null,
    });
    mocks.linkedTransactionMaybeSingle.mockResolvedValue({
      data: {
        id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
        wallet_id: 'wallet-1',
      },
      error: null,
    });
    mocks.walletMaybeSingle.mockResolvedValue({
      data: {
        id: 'wallet-2',
      },
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
    mocks.deleteEq.mockResolvedValue({
      error: null,
    });
    mocks.updateEq.mockResolvedValue({
      error: null,
    });
    mocks.tagDeleteEq.mockResolvedValue({
      error: null,
    });
    mocks.tagInsert.mockResolvedValue({
      error: null,
    });
  });

  it('returns a transaction enriched with tags', async () => {
    const { GET } = await import('./route.js');

    mocks.transactionRpc.mockResolvedValue({
      data: [
        {
          id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
          amount: -120,
          taken_at: '2026-03-30T08:00:00.000Z',
          description: 'Lunch',
        },
      ],
      error: null,
    });
    mocks.transactionTagsIn.mockResolvedValue({
      data: [
        {
          transaction_id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
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
      new Request('http://localhost/api/workspaces/ws-1/transactions/tx-1'),
      {
        params: Promise.resolve({
          transactionId: '8206f54b-4cae-4373-9a89-d09f80dd017d',
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
        tags: [
          {
            id: 'tag-1',
            name: 'Food',
            color: '#ff0000',
          },
        ],
      })
    );
  });

  it('deletes transactions through sbAdmin instead of the request client', async () => {
    const { DELETE } = await import('./route.js');

    const response = await DELETE(
      new Request('http://localhost/api/workspaces/ws-1/transactions/tx-1'),
      {
        params: Promise.resolve({
          transactionId: '8206f54b-4cae-4373-9a89-d09f80dd017d',
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith(
      'wallet_transactions'
    );
    expect(mocks.deleteEq).toHaveBeenCalledWith(
      'id',
      '8206f54b-4cae-4373-9a89-d09f80dd017d'
    );
  });

  it('updates transaction tags through sbAdmin tag tables', async () => {
    const { PUT } = await import('./route.js');

    const response = await PUT(
      new Request('http://localhost/api/workspaces/ws-1/transactions/tx-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: -45,
          tag_ids: [firstTagId, secondTagId],
        }),
      }),
      {
        params: Promise.resolve({
          transactionId: '8206f54b-4cae-4373-9a89-d09f80dd017d',
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.updateEq).toHaveBeenCalledWith(
      'id',
      '8206f54b-4cae-4373-9a89-d09f80dd017d'
    );
    expect(mocks.tagDeleteEq).toHaveBeenCalledWith(
      'transaction_id',
      '8206f54b-4cae-4373-9a89-d09f80dd017d'
    );
    expect(mocks.tagInsert).toHaveBeenCalledWith([
      {
        transaction_id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
        tag_id: firstTagId,
      },
      {
        transaction_id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
        tag_id: secondTagId,
      },
    ]);
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
  });

  it('does not allow create-only wallet permission to reassign an existing transaction wallet', async () => {
    const { PUT } = await import('./route.js');

    mocks.getPermissions.mockResolvedValue(
      withPermissions(['update_transactions', 'set_finance_wallets_on_create'])
    );

    const response = await PUT(
      new Request('http://localhost/api/workspaces/ws-1/transactions/tx-1', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin_wallet_id: 'f457f457-4444-4555-8666-111111111111',
        }),
      }),
      {
        params: Promise.resolve({
          transactionId: '8206f54b-4cae-4373-9a89-d09f80dd017d',
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions to change the wallet for transactions',
    });
  });
});
