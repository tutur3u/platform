import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));

vi.mock('@/lib/finance-route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.resolveFinanceRouteAuthContext,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverError,
  },
}));

describe('finance overview metrics route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({ auth: 'context' });
  });

  it('returns overview metrics from the private database RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          category_count: 4,
          invoice_count: 7,
          latest_transaction_at: '2026-05-24T00:00:00.000Z',
          net_total: 75,
          recent_expense_count: 1,
          recent_income_count: 2,
          recent_net_total: 55,
          recent_total_expense: 20,
          recent_total_income: 75,
          recent_transaction_count: 3,
          total_expense: 25,
          total_income: 100,
          transaction_count: 5,
          wallet_count: 2,
        },
      ],
      error: null,
    });
    const schema = vi.fn(() => ({ rpc }));

    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: { schema },
        user: { id: 'user-1' },
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/finance/overview?view=month&startDate=2026-05-01&endDate=2026-05-31&includeConfidential=false'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    expect(schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledWith('get_finance_overview_metrics', {
      _actor_id: 'user-1',
      _end_date: '2026-05-31',
      _start_date: '2026-05-01',
      _view: 'month',
      _ws_id: 'ws-1',
      include_confidential: false,
    });
    await expect(response.json()).resolves.toEqual({
      categoryCount: 4,
      invoiceCount: 7,
      latestTransactionAt: '2026-05-24T00:00:00.000Z',
      netTotal: 75,
      recentExpenseCount: 1,
      recentIncomeCount: 2,
      recentNetTotal: 55,
      recentTotalExpense: 20,
      recentTotalIncome: 75,
      recentTransactionCount: 3,
      totalExpense: 25,
      totalIncome: 100,
      transactionCount: 5,
      walletCount: 2,
    });
  });
});
