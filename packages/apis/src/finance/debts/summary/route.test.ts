import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const debtSummaryRpc = vi.fn();
  const getFinanceRouteContext = vi.fn();
  const publicRpc = vi.fn();
  const withoutPermission = vi.fn();

  const sbAdmin = {
    schema: vi.fn(() => ({
      rpc: debtSummaryRpc,
    })),
  };

  const supabase = {
    rpc: publicRpc,
  };

  return {
    debtSummaryRpc,
    getFinanceRouteContext,
    publicRpc,
    sbAdmin,
    supabase,
    withoutPermission,
  };
});

vi.mock('../../request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

describe('finance debt summary route', () => {
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
        supabase: mocks.supabase,
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.debtSummaryRpc.mockResolvedValue({
      data: [
        {
          active_debt_count: 1,
          active_loan_count: 0,
          net_position: -750000,
          total_debt_remaining: 750000,
          total_debts: 1000000,
          total_loan_remaining: 0,
          total_loans: 0,
        },
      ],
      error: null,
    });
  });

  it('loads debt summary from the private RPC', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request('http://localhost/api/workspaces/ws-1/debts/summary'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.sbAdmin.schema).toHaveBeenCalledWith('private');
    expect(mocks.debtSummaryRpc).toHaveBeenCalledWith('get_debt_loan_summary', {
      _actor_id: 'user-1',
      _ws_id: 'ws-1',
    });
    expect(mocks.publicRpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      active_debt_count: 1,
      active_loan_count: 0,
      net_position: -750000,
      total_debt_remaining: 750000,
      total_debts: 1000000,
      total_loan_remaining: 0,
      total_loans: 0,
    });
  });
});
