import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireFinanceStatsAccessMock } = vi.hoisted(() => ({
  requireFinanceStatsAccessMock: vi.fn(),
}));

vi.mock('../access', () => ({
  requireFinanceStatsAccess: requireFinanceStatsAccessMock,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

describe('finance income expense chart summary route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns prepared chart totals and balances from the database RPC', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: {
        average_expense: 25,
        average_income: 100,
        closing_balance: 200,
        data: [
          {
            period: '2026-05-24',
            total_expense: 25,
            total_income: 100,
          },
        ],
        net_total: 75,
        opening_balance: 125,
        total_expense: 25,
        total_income: 100,
      },
      error: null,
    });
    const schemaMock = vi.fn(() => ({ rpc: rpcMock }));

    requireFinanceStatsAccessMock.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        sbAdmin: {
          schema: schemaMock,
        },
        user: { id: 'user-1' },
      },
    });

    const { GET } = await import('./route');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/finance/charts/income-expense-summary?interval=daily&startDate=2026-05-01&endDate=2026-05-31&includeConfidential=false'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(rpcMock).toHaveBeenCalledWith('get_income_expense_chart_summary', {
      _actor_id: 'user-1',
      _end_date: '2026-05-31',
      _interval: 'daily',
      _start_date: '2026-05-01',
      _ws_id: 'ws-1',
      include_confidential: false,
    });
    await expect(response.json()).resolves.toEqual({
      average_expense: 25,
      average_income: 100,
      closing_balance: 200,
      data: [
        {
          period: '2026-05-24',
          total_expense: 25,
          total_income: 100,
        },
      ],
      net_total: 75,
      opening_balance: 125,
      total_expense: 25,
      total_income: 100,
    });
  });

  it('returns the finance access response before calling the private RPC', async () => {
    requireFinanceStatsAccessMock.mockResolvedValue({
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const { GET } = await import('./route');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/finance/charts/income-expense-summary?includeConfidential=true'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
  });

  it('rejects oversized daily date ranges before authorization or RPC work', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/finance/charts/income-expense-summary?includeConfidential=true&interval=daily&startDate=2000-01-01&endDate=2026-06-01'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(requireFinanceStatsAccessMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: 'Date range cannot exceed 366 days',
    });
  });
});
