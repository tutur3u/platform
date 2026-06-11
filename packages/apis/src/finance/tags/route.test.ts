import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const getFinanceRouteContext = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const tagStatsRpc = vi.fn();

  const sessionSupabase = {
    rpc: tagStatsRpc,
  };
  const privateRpc = vi.fn();
  const adminSupabase = {
    from: vi.fn(),
    schema: vi.fn(() => ({
      rpc: privateRpc,
    })),
  };

  return {
    adminSupabase,
    getFinanceRouteContext,
    getPermissions,
    normalizeWorkspaceId,
    privateRpc,
    sessionSupabase,
    tagStatsRpc,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

describe('finance tags route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.getFinanceRouteContext.mockImplementation(async () => ({
      context: {
        normalizedWsId: 'ws-1',
        permissions: await mocks.getPermissions(),
        sbAdmin: mocks.adminSupabase,
        supabase: mocks.sessionSupabase,
        user: {
          email: 'agent@example.com',
          id: 'user-1',
        },
      },
    }));
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.privateRpc.mockResolvedValue({
      data: [
        {
          tag_id: 'tag-1',
          tag_name: 'Bills',
          tag_color: '#ff0000',
          tag_description: 'Monthly bills',
          ws_id: 'ws-1',
          transaction_count: 2,
          income_count: 1,
          expense_count: 1,
          total_amount: 350,
          total_income: 100,
          total_expense: 250,
          net_total: -150,
          recent_transaction_count: 1,
          recent_income_count: 0,
          recent_expense_count: 1,
          recent_total_income: 0,
          recent_total_expense: 250,
          last_transaction_at: '2026-05-23T00:00:00.000Z',
        },
      ],
      error: null,
    });
  });

  it('returns tags enriched with aggregate amount and transaction count', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request('http://localhost/api/workspaces/ws-1/tags'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.schema).toHaveBeenCalledWith('private');
    expect(mocks.privateRpc).toHaveBeenCalledWith('get_transaction_tag_stats', {
      _actor_id: 'user-1',
      _ws_id: 'ws-1',
    });
    expect(mocks.tagStatsRpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual([
      {
        id: 'tag-1',
        name: 'Bills',
        color: '#ff0000',
        description: 'Monthly bills',
        ws_id: 'ws-1',
        amount: 350,
        transaction_count: 2,
        income_count: 1,
        expense_count: 1,
        total_income: 100,
        total_expense: 250,
        net_total: -150,
        recent_transaction_count: 1,
        recent_income_count: 0,
        recent_expense_count: 1,
        recent_total_income: 0,
        recent_total_expense: 250,
        last_transaction_at: '2026-05-23T00:00:00.000Z',
      },
    ]);
  });

  it('creates tags with descriptions', async () => {
    const insert = vi.fn((payload) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'tag-2',
            ...payload,
          },
          error: null,
        }),
      })),
    }));
    mocks.adminSupabase.from.mockImplementation((table: string) => {
      if (table !== 'transaction_tags') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return { insert };
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      new Request('http://localhost/api/workspaces/ws-1/tags', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Tuturuuu',
          color: '#9ef0ff',
          description: 'Platform costs',
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      ws_id: 'ws-1',
      name: 'Tuturuuu',
      color: '#9ef0ff',
      description: 'Platform costs',
    });
    await expect(response.json()).resolves.toEqual({
      id: 'tag-2',
      ws_id: 'ws-1',
      name: 'Tuturuuu',
      color: '#9ef0ff',
      description: 'Platform costs',
    });
  });
});
