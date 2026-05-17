import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const resolveAuthenticatedSessionUser = vi.fn();
  const transactionRpc = vi.fn();
  const invoiceReturns = vi.fn();

  const sessionSupabase = {
    rpc: transactionRpc,
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'finance_invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                returns: invoiceReturns,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    getPermissions,
    invoiceReturns,
    normalizeWorkspaceId,
    resolveAuthenticatedSessionUser,
    sessionSupabase,
    transactionRpc,
  };
});

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

describe('transaction export route', () => {
  const withPermissions = (granted: string[], wsId = 'workspace-1') => {
    const containsPermission = vi.fn((permission: string) =>
      granted.includes(permission)
    );

    return {
      containsPermission,
      withoutPermission: vi.fn(
        (permission: string) => !granted.includes(permission)
      ),
      wsId,
    };
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        withPermissions(['view_transactions', 'export_finance_data'], wsId)
      )
    );
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: {
        id: 'user-1',
      },
    });
    mocks.transactionRpc.mockResolvedValue({ data: [], error: null });
    mocks.invoiceReturns.mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('exports transactions through the permission-aware RPC', async () => {
    const { GET } = await import('./route.js');

    mocks.transactionRpc.mockImplementation((functionName: string) => {
      if (functionName === 'get_wallet_transactions_with_permissions') {
        return Promise.resolve({
          data: [
            {
              id: 'transaction-1',
              amount: -25,
              description: 'Lunch',
              category_name: 'Food',
              created_at: '2026-05-01T09:00:00.000Z',
              creator_email: 'creator@example.com',
              creator_full_name: 'Creator Name',
              invoice_id: 'invoice-1',
              report_opt_in: true,
              taken_at: '2026-05-01T08:00:00.000Z',
              total_count: 1,
              wallet_name: 'Cash',
            },
          ],
          error: null,
        });
      }

      if (functionName === 'get_transaction_list_enrichment') {
        return Promise.resolve({
          data: [
            {
              transaction_id: 'transaction-1',
              tags: [
                {
                  name: 'Meals',
                },
              ],
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected RPC: ${functionName}`);
    });
    mocks.invoiceReturns.mockResolvedValue({
      data: [
        {
          id: 'invoice-1',
          transaction_id: 'transaction-1',
          workspace_users: {
            display_name: 'Customer',
            full_name: 'Customer Full',
            email: 'customer@example.com',
          },
        },
      ],
      error: null,
    });

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/workspace-1/transactions/export?page=2&pageSize=50&tagIds=tag-1'
      ),
      {
        params: Promise.resolve({
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.transactionRpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      expect.objectContaining({
        p_include_count: true,
        p_limit: 50,
        p_offset: 50,
        p_tag_ids: ['tag-1'],
        p_user_id: 'user-1',
        p_ws_id: 'workspace-1',
      })
    );
    expect(mocks.adminSupabase.from).not.toHaveBeenCalledWith(
      'wallet_transactions'
    );
    expect(mocks.adminSupabase.from).not.toHaveBeenCalledWith(
      'wallet_transaction_tags'
    );
    expect(mocks.transactionRpc).toHaveBeenCalledWith(
      'get_transaction_list_enrichment',
      expect.objectContaining({
        p_transaction_ids: ['transaction-1'],
        p_user_id: 'user-1',
        p_ws_id: 'workspace-1',
      })
    );
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [
        {
          amount: -25,
          category: 'Food',
          created_at: '2026-05-01T09:00:00.000Z',
          creator_email: 'creator@example.com',
          creator_name: 'Creator Name',
          description: 'Lunch',
          invoice_for_email: 'customer@example.com',
          invoice_for_name: 'Customer',
          report_opt_in: true,
          tags: 'Meals',
          taken_at: '2026-05-01T08:00:00.000Z',
          transaction_type: 'expense',
          wallet: 'Cash',
        },
      ],
    });
  });

  it('requires finance export permission', async () => {
    const { GET } = await import('./route.js');

    mocks.getPermissions.mockResolvedValue(
      withPermissions(['view_transactions'])
    );

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/workspace-1/transactions/export'
      ),
      {
        params: Promise.resolve({
          wsId: 'workspace-1',
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.transactionRpc).not.toHaveBeenCalled();
  });
});
