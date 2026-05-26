import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getFinanceRouteContext = vi.fn();
  const tagOrder = vi.fn();
  const tagEq = vi.fn(() => ({
    order: tagOrder,
  }));
  const tagSelect = vi.fn(() => ({
    eq: tagEq,
  }));

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table !== 'transaction_tags') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: tagSelect,
      };
    }),
  };

  return {
    adminSupabase,
    getFinanceRouteContext,
    tagEq,
    tagOrder,
    tagSelect,
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00.000Z'));

    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: mocks.adminSupabase,
      },
    });
    mocks.tagOrder.mockResolvedValue({
      data: [
        {
          id: 'tag-1',
          name: 'RMIT',
          color: '#ec4899',
          wallet_transaction_tags: [
            {
              transaction_id: 'tx-expense-recent',
              wallet_transactions: {
                amount: -40000,
                taken_at: '2026-05-23T00:00:00.000Z',
              },
            },
            {
              transaction_id: 'tx-income-recent',
              wallet_transactions: {
                amount: 55000,
                taken_at: '2026-05-19T00:00:00.000Z',
              },
            },
            {
              transaction_id: 'tx-expense-older',
              wallet_transactions: {
                amount: -12000,
                taken_at: '2026-04-10T00:00:00.000Z',
              },
            },
          ],
        },
        {
          id: 'tag-2',
          name: 'Empty',
          color: '#94a3b8',
          wallet_transaction_tags: [],
        },
      ],
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aggregates tag income, expenses, and recent pace through the admin client', async () => {
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
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('transaction_tags');
    expect(mocks.tagEq).toHaveBeenCalledWith('ws_id', 'ws-1');
    await expect(response.json()).resolves.toEqual([
      {
        tag_id: 'tag-1',
        tag_name: 'RMIT',
        tag_color: '#ec4899',
        transaction_count: 3,
        income_count: 1,
        expense_count: 2,
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
      {
        tag_id: 'tag-2',
        tag_name: 'Empty',
        tag_color: '#94a3b8',
        transaction_count: 0,
        income_count: 0,
        expense_count: 0,
        total_income: 0,
        total_expense: 0,
        net_total: 0,
        recent_transaction_count: 0,
        recent_income_count: 0,
        recent_expense_count: 0,
        recent_total_income: 0,
        recent_total_expense: 0,
        last_transaction_at: null,
      },
    ]);
  });
});
