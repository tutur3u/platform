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

describe('finance category breakdown chart route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns category breakdown data from the private database RPC', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [
        {
          category_color: '#0f766e',
          category_icon: 'utensils',
          category_id: 'category-1',
          category_name: 'Food',
          period: '2026-05-01',
          total: 125,
        },
      ],
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
        'http://localhost/api/workspaces/ws-1/finance/charts/categories?interval=weekly&transactionType=income&anchorToLatest=true&timezone=Asia%2FHo_Chi_Minh&startDate=2026-05-01&endDate=2026-05-31&includeConfidential=false'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(rpcMock).toHaveBeenCalledWith('get_category_breakdown', {
      _actor_id: 'user-1',
      _anchor_to_latest: true,
      _end_date: '2026-05-31',
      _interval: 'weekly',
      _start_date: '2026-05-01',
      _timezone: 'Asia/Ho_Chi_Minh',
      _transaction_type: 'income',
      _ws_id: 'ws-1',
      include_confidential: false,
    });
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          category_color: '#0f766e',
          category_icon: 'utensils',
          category_id: 'category-1',
          category_name: 'Food',
          period: '2026-05-01',
          total: 125,
        },
      ],
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
        'http://localhost/api/workspaces/ws-1/finance/charts/categories'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
  });
});
