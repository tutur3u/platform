import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getFinanceRouteContext = vi.fn();
  const transactionTagStatsRpc = vi.fn();
  const privateRpc = vi.fn();

  const sessionSupabase = {
    rpc: transactionTagStatsRpc,
  };
  const adminSupabase = {
    schema: vi.fn(() => ({
      rpc: privateRpc,
    })),
  };

  return {
    adminSupabase,
    getFinanceRouteContext,
    privateRpc,
    sessionSupabase,
    transactionTagStatsRpc,
  };
});

vi.mock('../../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

describe('finance tag stats route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: mocks.adminSupabase,
        supabase: mocks.sessionSupabase,
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.privateRpc.mockResolvedValue({
      data: [
        {
          tag_id: 'tag-1',
          tag_name: 'RMIT',
          tag_color: '#ec4899',
          tag_description: 'Confidential aggregate proof',
          ws_id: 'ws-1',
          transaction_count: 3,
          income_count: 1,
          expense_count: 2,
          total_amount: 107000,
          total_income: 55000,
          total_expense: 52000,
          net_total: 3000,
          recent_transaction_count: 2,
          recent_income_count: 1,
          recent_expense_count: 1,
          recent_total_income: 55000,
          recent_total_expense: 40000,
          last_transaction_at: '2026-05-23T00:00:00.000Z',
        },
      ],
      error: null,
    });
  });

  it('returns tag income, expenses, and recent pace from the RPC', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request('http://localhost/api/workspaces/ws-1/tags/stats'),
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
    expect(mocks.transactionTagStatsRpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual([
      {
        tag_id: 'tag-1',
        tag_name: 'RMIT',
        tag_color: '#ec4899',
        tag_description: 'Confidential aggregate proof',
        ws_id: 'ws-1',
        transaction_count: 3,
        income_count: 1,
        expense_count: 2,
        total_amount: 107000,
        total_income: 55000,
        total_expense: 52000,
        net_total: 3000,
        recent_transaction_count: 2,
        recent_income_count: 1,
        recent_expense_count: 1,
        recent_total_income: 55000,
        recent_total_expense: 40000,
        last_transaction_at: '2026-05-23T00:00:00.000Z',
      },
    ]);
  });
});
