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

describe('finance balance trend chart route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns balance trends from the database RPC', async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [
        {
          balance: 125000,
          date: '2026-05-24',
        },
        {
          balance: 130000,
          date: '2026-05-25',
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
        'http://localhost/api/workspaces/ws-1/finance/charts/balance-trend?startDate=2026-05-01&endDate=2026-05-31&includeConfidential=false'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(schemaMock).toHaveBeenCalledWith('private');
    expect(rpcMock).toHaveBeenCalledWith('get_balance_trend', {
      _actor_id: 'user-1',
      _end_date: '2026-05-31',
      _max_points: 60,
      _start_date: '2026-05-01',
      _ws_id: 'ws-1',
      include_confidential: false,
    });
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          balance: 125000,
          date: '2026-05-24',
        },
        {
          balance: 130000,
          date: '2026-05-25',
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
        'http://localhost/api/workspaces/ws-1/finance/charts/balance-trend?includeConfidential=true'
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
