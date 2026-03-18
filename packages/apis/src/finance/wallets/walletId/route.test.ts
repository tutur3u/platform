import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleWallet: vi.fn(),
}));

vi.mock('../wallet-access', async () => {
  const actual = await vi.importActual<typeof import('../wallet-access.js')>(
    '../wallet-access.js'
  );

  return {
    ...actual,
    getAccessibleWallet: (
      ...args: Parameters<typeof mocks.getAccessibleWallet>
    ) => mocks.getAccessibleWallet(...args),
  };
});

describe('wallet detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns flattened wallet data from the shared wallet access helper', async () => {
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        requiredPermission: 'view_transactions',
        sbAdmin: {},
        supabase: {},
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
        name: 'Primary Wallet',
        credit_wallets: {
          limit: 1200,
          statement_date: 15,
          payment_date: 25,
        },
      },
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 'wallet-1',
      name: 'Primary Wallet',
      limit: 1200,
      statement_date: 15,
      payment_date: 25,
    });
  });
});
