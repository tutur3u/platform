import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getAccessibleWallet = vi.fn();
  const summaryRpc = vi.fn();
  const from = vi.fn(() => ({
    eq: vi.fn(() => ({
      order: vi.fn(() => ({
        single: vi.fn(),
      })),
      single: vi.fn(),
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(),
      })),
      gte: vi.fn(() => ({
        lte: vi.fn(),
      })),
    })),
  }));

  const sbAdmin = {
    schema: vi.fn(() => ({
      rpc: summaryRpc,
    })),
  };

  return {
    from,
    getAccessibleWallet,
    sbAdmin,
    summaryRpc,
  };
});

vi.mock('../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

describe('wallet interest route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns the shared wallet access response when wallet access is denied', async () => {
    mocks.getAccessibleWallet.mockResolvedValue({
      response: NextResponse.json(
        { message: 'Wallet not found' },
        { status: 404 }
      ),
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/wallets/wallet-1'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: 'Wallet not found',
    });
  });

  it('loads the interest summary from a private RPC', async () => {
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        sbAdmin: mocks.sbAdmin,
        supabase: {
          from: mocks.from,
        },
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
      },
    });
    mocks.summaryRpc.mockResolvedValue({
      data: {
        averageDailyInterest: 1,
        config: { id: 'config-1' },
        currentRate: { annual_rate: 5 },
        estimatedMonthlyInterest: 22,
        estimatedYearlyInterest: 260,
        monthToDateInterest: 2,
        pendingDeposits: [],
        projections: {
          month: [],
          quarter: [],
          week: [],
          year: [],
        },
        rateHistory: [],
        todayInterest: 1,
        totalEarnedInterest: 10,
        yearToDateInterest: 3,
      },
      error: null,
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/wallets/wallet-1/interest'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
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
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.sbAdmin.schema).toHaveBeenCalledWith('private');
    expect(mocks.summaryRpc).toHaveBeenCalledWith(
      'get_wallet_interest_summary',
      {
        _actor_id: 'user-1',
        _wallet_id: 'wallet-1',
        _ws_id: 'ws-1',
      }
    );
    await expect(response.json()).resolves.toMatchObject({
      todayInterest: 1,
      estimatedMonthlyInterest: 22,
      estimatedYearlyInterest: 260,
    });
  });
});
