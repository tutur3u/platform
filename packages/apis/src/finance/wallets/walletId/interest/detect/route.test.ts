import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calculateDailyInterest = vi.fn();
  const detectInterestTransactions = vi.fn();
  const detectionRpc = vi.fn();
  const getAccessibleWallet = vi.fn();
  const summarizeDetectionResults = vi.fn();

  const supabase = {
    from: vi.fn(),
  };

  const sbAdmin = {
    schema: vi.fn(() => ({
      rpc: detectionRpc,
    })),
  };

  return {
    calculateDailyInterest,
    detectInterestTransactions,
    detectionRpc,
    getAccessibleWallet,
    sbAdmin,
    summarizeDetectionResults,
    supabase,
  };
});

vi.mock('@tuturuuu/utils/finance', () => ({
  calculateDailyInterest: (
    ...args: Parameters<typeof mocks.calculateDailyInterest>
  ) => mocks.calculateDailyInterest(...args),
  detectInterestTransactions: (
    ...args: Parameters<typeof mocks.detectInterestTransactions>
  ) => mocks.detectInterestTransactions(...args),
  formatDateString: (date: Date) => date.toISOString().slice(0, 10),
  summarizeDetectionResults: (
    ...args: Parameters<typeof mocks.summarizeDetectionResults>
  ) => mocks.summarizeDetectionResults(...args),
}));

vi.mock('../../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

describe('wallet interest detect route', () => {
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
    mocks.detectionRpc.mockResolvedValue({
      data: {
        detected: [
          {
            amount: 1000,
            confidence: 'high',
            date: '2026-05-01',
            description: 'daily interest',
            matchReason: 'Description matches interest pattern',
            transactionId: 'tx-1',
          },
        ],
        summary: {
          highConfidence: 1,
          lowConfidence: 0,
          mediumConfidence: 0,
        },
        totalAmount: 1000,
      },
      error: null,
    });
  });

  it('loads detected interest transactions and totals from a private RPC', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/wallets/wallet-1/interest/detect'
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
    expect(mocks.detectionRpc).toHaveBeenCalledWith(
      'detect_wallet_interest_transactions',
      {
        _actor_id: 'user-1',
        _wallet_id: 'wallet-1',
        _ws_id: 'ws-1',
      }
    );
    expect(mocks.supabase.from).not.toHaveBeenCalled();
    expect(mocks.calculateDailyInterest).not.toHaveBeenCalled();
    expect(mocks.detectInterestTransactions).not.toHaveBeenCalled();
    expect(mocks.summarizeDetectionResults).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      summary: {
        highConfidence: 1,
      },
      totalAmount: 1000,
    });
  });
});
