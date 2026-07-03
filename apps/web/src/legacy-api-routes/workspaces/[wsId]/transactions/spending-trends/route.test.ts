import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getFinanceRouteContext = vi.fn();
  const resolveFinanceRouteAuthContext = vi.fn();
  const spendingTrendsRpc = vi.fn();
  const withoutPermission = vi.fn();

  return {
    getFinanceRouteContext,
    resolveFinanceRouteAuthContext,
    spendingTrendsRpc,
    withoutPermission,
  };
});

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@/lib/finance-route-auth', () => ({
  resolveFinanceRouteAuthContext: (
    ...args: Parameters<typeof mocks.resolveFinanceRouteAuthContext>
  ) => mocks.resolveFinanceRouteAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

describe('transaction spending trends route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.withoutPermission.mockReturnValue(false);
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({
      type: 'session',
    });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: mocks.withoutPermission,
        },
        supabase: {
          rpc: mocks.spendingTrendsRpc,
        },
      },
    });
    mocks.spendingTrendsRpc.mockResolvedValue({
      data: [
        {
          date: '2026-05-24',
          amount: 125000,
        },
        {
          date: '2026-05-25',
          amount: 0,
        },
      ],
      error: null,
    });
  });

  it('returns daily spending trends from the database RPC', async () => {
    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/transactions/spending-trends/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions/spending-trends?days=14&timezone=Asia/Ho_Chi_Minh'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.spendingTrendsRpc).toHaveBeenCalledWith(
      'get_spending_trends',
      {
        _days: 14,
        _timezone: 'Asia/Ho_Chi_Minh',
        _ws_id: 'ws-1',
      }
    );
    await expect(response.json()).resolves.toEqual([
      {
        date: '2026-05-24',
        amount: 125000,
      },
      {
        date: '2026-05-25',
        amount: 0,
      },
    ]);
  });
});
