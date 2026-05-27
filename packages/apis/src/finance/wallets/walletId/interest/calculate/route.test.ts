import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calculateInterest = vi.fn();
  const getAccessibleWallet = vi.fn();
  const calculationRpc = vi.fn();

  const supabase = {
    from: vi.fn(),
  };

  const sbAdmin = {
    schema: vi.fn(() => ({
      rpc: calculationRpc,
    })),
  };

  return {
    calculateInterest,
    calculationRpc,
    getAccessibleWallet,
    sbAdmin,
    supabase,
  };
});

vi.mock('@tuturuuu/utils/finance', () => ({
  calculateInterest: (...args: Parameters<typeof mocks.calculateInterest>) =>
    mocks.calculateInterest(...args),
  formatDateString: (date: Date) => date.toISOString().slice(0, 10),
}));

vi.mock('../../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

describe('wallet interest calculate route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        sbAdmin: mocks.sbAdmin,
        supabase: mocks.supabase,
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
      },
    });
    mocks.calculationRpc.mockResolvedValue({
      data: {
        businessDaysCount: 1,
        dailyResults: [],
        finalBalance: 750,
        fromDate: '2026-05-01',
        initialBalance: 750,
        nonBusinessDaysCount: 0,
        toDate: '2026-05-02',
        totalInterest: 0,
      },
      error: null,
    });
  });

  it('loads the date-range interest calculation from a private RPC', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/wallets/wallet-1/interest/calculate?from=2026-05-01&to=2026-05-02'
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
    expect(mocks.calculationRpc).toHaveBeenCalledWith(
      'calculate_wallet_interest',
      {
        _actor_id: 'user-1',
        _from_date: '2026-05-01',
        _to_date: '2026-05-02',
        _wallet_id: 'wallet-1',
        _ws_id: 'ws-1',
      }
    );
    expect(mocks.supabase.from).not.toHaveBeenCalled();
    expect(mocks.calculateInterest).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      fromDate: '2026-05-01',
      initialBalance: 750,
      toDate: '2026-05-02',
    });
  });
});
