import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getFinanceRouteContext = vi.fn();
  const debtDetailRpc = vi.fn();
  const withoutPermission = vi.fn();

  const sbAdmin = {
    schema: vi.fn(() => ({
      rpc: debtDetailRpc,
    })),
  };

  return {
    debtDetailRpc,
    getFinanceRouteContext,
    sbAdmin,
    withoutPermission,
  };
});

vi.mock('../../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

describe('finance debt detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.withoutPermission.mockReturnValue(false);
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: mocks.withoutPermission,
        },
        sbAdmin: mocks.sbAdmin,
        supabase: {},
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.debtDetailRpc.mockResolvedValue({
      data: [
        {
          id: 'debt-1',
          ws_id: 'ws-1',
          name: 'Laptop loan',
          principal_amount: 1000000,
          total_paid: 250000,
          remaining_balance: 750000,
          progress_percentage: 25,
        },
      ],
      error: null,
    });
  });

  it('loads debt balance fields from the private RPC', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request('http://localhost/api/workspaces/ws-1/debts/debt-1'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          debtId: 'debt-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.sbAdmin.schema).toHaveBeenCalledWith('private');
    expect(mocks.debtDetailRpc).toHaveBeenCalledWith(
      'get_debt_loan_with_balance',
      {
        _actor_id: 'user-1',
        _debt_id: 'debt-1',
        _ws_id: 'ws-1',
      }
    );
    expect(mocks.sbAdmin.schema).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      id: 'debt-1',
      ws_id: 'ws-1',
      name: 'Laptop loan',
      principal_amount: 1000000,
      total_paid: 250000,
      remaining_balance: 750000,
      progress_percentage: 25,
    });
  });

  it('returns 404 when the private RPC has no matching debt row', async () => {
    mocks.debtDetailRpc.mockResolvedValueOnce({ data: [], error: null });
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request('http://localhost/api/workspaces/ws-1/debts/missing'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          debtId: 'missing',
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Debt/loan not found',
    });
  });
});
