import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getAccessibleWallet = vi.fn();
  const projectionRpc = vi.fn();

  const sbAdmin = {
    schema: vi.fn(() => ({
      rpc: projectionRpc,
    })),
  };

  return {
    getAccessibleWallet,
    projectionRpc,
    sbAdmin,
  };
});

vi.mock('../../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

describe('wallet interest projection route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        sbAdmin: mocks.sbAdmin,
        supabase: {},
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
      },
    });
    mocks.projectionRpc.mockResolvedValue({
      data: {
        currentBalance: 1000,
        currentRate: 5,
        days: 2,
        projections: [
          {
            date: '2026-05-01',
            isBusinessDay: true,
            projectedBalance: 1000,
            projectedCumulativeInterest: 0,
            projectedDailyInterest: 0,
          },
        ],
        startDate: '2026-05-01',
        summary: {
          businessDays: 1,
          finalBalance: 1000,
          nonBusinessDays: 1,
          percentageGain: '0.0000',
          totalProjectedInterest: 0,
        },
      },
      error: null,
    });
  });

  it('loads projection details and summary from a private RPC', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/wallets/wallet-1/interest/project?startDate=2026-05-01&days=2'
      ),
      {
        params: Promise.resolve({
          walletId: 'wallet-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.getAccessibleWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredPermission: 'view_transactions',
        select: 'id',
        walletId: 'wallet-1',
        wsId: 'ws-1',
      })
    );
    expect(mocks.sbAdmin.schema).toHaveBeenCalledWith('private');
    expect(mocks.projectionRpc).toHaveBeenCalledWith(
      'get_wallet_interest_projection',
      {
        _actor_id: 'user-1',
        _days: 2,
        _start_date: '2026-05-01',
        _wallet_id: 'wallet-1',
        _ws_id: 'ws-1',
      }
    );
    await expect(response.json()).resolves.toMatchObject({
      currentBalance: 1000,
      currentRate: 5,
      days: 2,
      startDate: '2026-05-01',
      summary: {
        totalProjectedInterest: 0,
      },
    });
  });

  it('maps disabled interest tracking from the RPC to a bad request', async () => {
    mocks.projectionRpc.mockResolvedValueOnce({
      data: { error: 'disabled' },
      error: null,
    });
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/wallets/wallet-1/interest/project?startDate=2026-05-01&days=2'
      ),
      {
        params: Promise.resolve({
          walletId: 'wallet-1',
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Interest tracking is disabled for this wallet',
    });
  });
});
