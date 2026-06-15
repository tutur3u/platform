import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const getWorkspaceConfig = vi.fn();
  const getUser = vi.fn();
  const linkedUserMaybeSingle = vi.fn();
  const walletMaybeSingle = vi.fn();
  const transactionInsert = vi.fn();
  const transactionSingle = vi.fn();
  const tagInsert = vi.fn();
  const transactionRpc = vi.fn();
  const adminRpc = vi.fn();
  const tagValidationEq = vi.fn();
  const tagValidationIn = vi.fn(() => ({
    eq: tagValidationEq,
  }));
  const transactionTagsEq = vi.fn();
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
                maybeSingle: linkedUserMaybeSingle,
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

  const privateSupabase = {
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
          insert: transactionInsert,
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

      if (table === 'transaction_tags') {
        return {
          select: vi.fn(() => ({
            in: tagValidationIn,
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
    rpc: adminRpc,
  };

  transactionTagsIn.mockImplementation(() => ({
    eq: transactionTagsEq,
  }));

  transactionInsert.mockImplementation(() => ({
    select: vi.fn(() => ({
      single: transactionSingle,
    })),
  }));

  return {
    adminSupabase,
    adminRpc,
    getPermissions,
    getWorkspaceConfig,
    linkedUserMaybeSingle,
    sessionSupabase,
    tagInsert,
    tagValidationEq,
    tagValidationIn,
    transactionInsert,
    transactionRpc,
    transactionTagsEq,
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
  normalizeWorkspaceId: vi.fn((id: string) =>
    Promise.resolve(
      id === 'personal' ? '00000000-0000-0000-0000-000000000000' : id
    )
  ),
  verifyWorkspaceMembershipType: vi.fn(() =>
    Promise.resolve({ ok: true, membershipType: 'MEMBER' as const })
  ),
}));

describe('transactions route', () => {
  const normalizedPersonalWsId = '00000000-0000-0000-0000-000000000000';
  const normalizeTestWsId = (wsId: string) =>
    wsId === 'personal' ? normalizedPersonalWsId : wsId;
  const withPermissions = (
    granted: string[],
    wsId = normalizedPersonalWsId
  ) => {
    const containsPermission = vi.fn((permission: string) =>
      granted.includes(permission)
    );

    return {
      containsPermission,
      withoutPermission: vi.fn(
        (permission: string) => !granted.includes(permission)
      ),
      wsId: normalizeTestWsId(wsId),
    };
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        withPermissions(
          [
            'create_transactions',
            'delete_transactions',
            'export_finance_data',
            'manage_finance',
            'update_transactions',
            'view_expenses',
            'view_incomes',
            'view_transactions',
          ],
          wsId
        )
      )
    );
    mocks.getWorkspaceConfig.mockResolvedValue(null);
    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.linkedUserMaybeSingle.mockResolvedValue({
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
    mocks.tagValidationEq.mockResolvedValue({
      data: [
        {
          id: 'd7d55de5-0ea8-4e9a-92dc-9a6e13f0a30c',
        },
      ],
      error: null,
    });
    mocks.transactionRpc.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
      data: 'virtual-user-1',
      error: null,
    });
    mocks.transactionTagsEq.mockResolvedValue({
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
          category_color: '#ef4444',
          category_icon: 'Utensils',
          category_name: 'Food & Beverage',
          creator_avatar_url: 'https://example.com/avatar.png',
          creator_email: 'creator@example.com',
          creator_full_name: 'Creator Name',
          taken_at: '2026-03-30T08:00:00.000Z',
          description: 'Lunch',
          wallet_name: 'Cash',
        },
      ],
      error: null,
    });
    mocks.transactionTagsEq.mockResolvedValue({
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
    expect(mocks.transactionTagsIn).toHaveBeenCalledWith('transaction_id', [
      'transaction-1',
    ]);
    expect(mocks.transactionTagsEq).toHaveBeenCalledWith(
      'transaction_tags.ws_id',
      normalizedPersonalWsId
    );
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: 'transaction-1',
        category: 'Food & Beverage',
        category_color: '#ef4444',
        category_icon: 'Utensils',
        tags: [
          {
            id: 'tag-1',
            name: 'Food',
            color: '#ff0000',
          },
        ],
        user: {
          avatar_url: 'https://example.com/avatar.png',
          email: 'creator@example.com',
          full_name: 'Creator Name',
        },
        wallet: 'Cash',
      }),
    ]);
  });

  it('returns pagination metadata when includeCount is requested', async () => {
    const { GET } = await import('./route.js');

    mocks.transactionRpc.mockResolvedValue({
      data: [
        {
          id: 'transaction-1',
          amount: -150,
          taken_at: '2026-03-30T08:00:00.000Z',
          total_count: 12,
        },
      ],
      error: null,
    });

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions?page=2&itemsPerPage=5&includeCount=true'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 12,
      data: [
        expect.objectContaining({
          id: 'transaction-1',
        }),
      ],
      pagination: {
        hasNextPage: true,
        hasPreviousPage: true,
        limit: 5,
        offset: 5,
        page: 2,
        pageCount: 3,
        pageSize: 5,
        total: 12,
      },
    });
    expect(mocks.transactionRpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      expect.objectContaining({
        p_include_count: true,
        p_limit: 5,
        p_offset: 5,
      })
    );
  });

  it('normalizes personal workspace aliases before fetching transactions', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/personal/transactions?page=1&itemsPerPage=5'
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.transactionRpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      expect.objectContaining({
        p_ws_id: '00000000-0000-0000-0000-000000000000',
      })
    );
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
    await expect(response.json()).resolves.toEqual({
      message: 'success',
      transaction_id: 'transaction-1',
    });
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith(
      'wallet_transactions'
    );
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith(
      'wallet_transaction_tags'
    );
    expect(mocks.transactionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: 'virtual-user-1',
        platform_creator_id: 'user-1',
        taken_at: '2026-03-30T08:00:00.000Z',
      })
    );
    expect(mocks.transactionSingle).toHaveBeenCalled();
    expect(mocks.tagValidationIn).toHaveBeenCalledWith('id', [
      'd7d55de5-0ea8-4e9a-92dc-9a6e13f0a30c',
    ]);
    expect(mocks.tagValidationEq).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000000'
    );
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalledWith(
      'wallet_transactions'
    );
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalledWith(
      'wallet_transaction_tags'
    );
  });

  it('rejects transaction creation with tags outside the workspace', async () => {
    const { POST } = await import('./route.js');

    mocks.tagValidationEq.mockResolvedValue({
      data: [],
      error: null,
    });

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

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Invalid transaction tags',
    });
    expect(mocks.transactionInsert).not.toHaveBeenCalled();
    expect(mocks.tagInsert).not.toHaveBeenCalled();
  });

  it('rejects invalid transaction dates before insert', async () => {
    const { POST } = await import('./route.js');

    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          amount: 150,
          origin_wallet_id: '3c9a5c7f-4f0d-4f15-9477-cbf1c7bc7445',
          taken_at: 'not-a-date',
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
      message: 'Invalid transaction date',
    });
    expect(mocks.adminSupabase.from).not.toHaveBeenCalledWith(
      'wallet_transactions'
    );
  });

  it('repairs a missing linked workspace user before inserting the legacy creator id', async () => {
    const { POST } = await import('./route.js');

    mocks.linkedUserMaybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          virtual_user_id: 'repaired-virtual-user-1',
        },
        error: null,
      });

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
    expect(mocks.adminRpc).toHaveBeenCalledWith('ensure_workspace_user_link', {
      target_user_id: 'user-1',
      target_ws_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(mocks.transactionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: 'repaired-virtual-user-1',
        platform_creator_id: 'user-1',
      })
    );
  });

  it('creates transactions with platform creator when linked workspace user repair fails', async () => {
    const { POST } = await import('./route.js');

    mocks.linkedUserMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: {
        message: 'repair failed',
      },
    });

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
    expect(mocks.transactionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        creator_id: null,
        platform_creator_id: 'user-1',
      })
    );
  });

  it('uses the normalized workspace id for personal workspace create config checks', async () => {
    const { POST } = await import('./route.js');

    const response = await POST(
      new Request('http://localhost/api/workspaces/personal/transactions', {
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
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.getWorkspaceConfig).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000000',
      'default_wallet_id'
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
    await expect(response.json()).resolves.toEqual({
      message: 'success',
      transaction_id: 'transaction-1',
    });
  });
});
