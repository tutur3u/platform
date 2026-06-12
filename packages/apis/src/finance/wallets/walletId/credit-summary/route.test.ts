import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleWallet: vi.fn(),
}));

vi.mock('../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

describe('wallet credit summary route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns the prepared credit summary from the database RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        availableCredit: 800,
        balance: -200,
        currentActivity: -50,
        cycleEnd: '2026-06-15',
        cycleStart: '2026-05-15',
        daysUntilPayment: 10,
        daysUntilStatement: 20,
        limit: 1000,
        nextPaymentDate: '2026-06-25',
        nextStatementDate: '2026-06-15',
        prevCycleEnd: '2026-05-15',
        prevCycleStart: '2026-04-15',
        statementBalance: -150,
        totalOutstanding: 200,
        utilization: 20,
      },
      error: null,
    });
    const schema = vi.fn(() => ({ rpc }));

    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        sbAdmin: {
          schema,
        },
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/wallets/wallet-1/credit-summary'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.getAccessibleWallet).toHaveBeenCalledWith({
      authContext: undefined,
      req: expect.any(Request),
      requiredPermission: 'view_transactions',
      select: 'id',
      walletId: 'wallet-1',
      wsId: 'ws-1',
    });
    expect(schema).toHaveBeenCalledWith('private');
    expect(rpc).toHaveBeenCalledWith('get_credit_wallet_summary', {
      _actor_id: 'user-1',
      _wallet_id: 'wallet-1',
      _ws_id: 'ws-1',
    });
    await expect(response.json()).resolves.toEqual({
      availableCredit: 800,
      balance: -200,
      currentActivity: -50,
      cycleEnd: '2026-06-15',
      cycleStart: '2026-05-15',
      daysUntilPayment: 10,
      daysUntilStatement: 20,
      limit: 1000,
      nextPaymentDate: '2026-06-25',
      nextStatementDate: '2026-06-15',
      prevCycleEnd: '2026-05-15',
      prevCycleStart: '2026-04-15',
      statementBalance: -150,
      totalOutstanding: 200,
      utilization: 20,
    });
  });

  it('forwards an optional finance route auth context to wallet access', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        availableCredit: 800,
        balance: -200,
        currentActivity: -50,
        cycleEnd: '2026-06-15',
        cycleStart: '2026-05-15',
        daysUntilPayment: 10,
        daysUntilStatement: 20,
        limit: 1000,
        nextPaymentDate: '2026-06-25',
        nextStatementDate: '2026-06-15',
        prevCycleEnd: '2026-05-15',
        prevCycleStart: '2026-04-15',
        statementBalance: -150,
        totalOutstanding: 200,
        utilization: 20,
      },
      error: null,
    });
    const authContext = {
      sbAdmin: {},
      supabase: {},
      user: {
        id: 'user-1',
      },
    };

    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-resolved',
        sbAdmin: {
          schema: vi.fn(() => ({ rpc })),
        },
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/wallets/wallet-1/credit-summary'),
      {
        params: Promise.resolve({
          wsId: 'personal',
          walletId: 'wallet-1',
        }),
      },
      authContext as never
    );

    expect(response.status).toBe(200);
    expect(mocks.getAccessibleWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        authContext,
        walletId: 'wallet-1',
        wsId: 'personal',
      })
    );
  });
});
