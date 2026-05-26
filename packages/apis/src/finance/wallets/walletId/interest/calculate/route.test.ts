import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const calculateInterest = vi.fn();
  const getAccessibleWallet = vi.fn();
  const initialBalanceRpc = vi.fn();
  const selectedColumns: string[] = [];

  function responseFor(table: string, selected: string) {
    if (table === 'wallet_interest_configs') {
      return { data: { enabled: true, id: 'config-1' }, error: null };
    }

    if (table === 'wallet_interest_rates') {
      return {
        data: [{ annual_rate: 5, effective_from: '2026-01-01' }],
        error: null,
      };
    }

    if (table === 'vietnamese_holidays') {
      return { data: [], error: null };
    }

    if (table === 'wallet_transactions' && selected === 'created_at, amount') {
      return {
        data: [
          {
            amount: 100,
            created_at: '2026-05-01T00:00:00.000Z',
          },
        ],
        error: null,
      };
    }

    if (table === 'wallet_transactions') {
      return { data: [], error: null };
    }

    return { data: null, error: null };
  }

  function createQuery(table: string) {
    let selected = '';
    const query = {
      eq: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() =>
        table === 'vietnamese_holidays'
          ? Promise.resolve(responseFor(table, selected))
          : query
      ),
      order: vi.fn(() => Promise.resolve(responseFor(table, selected))),
      select: vi.fn((columns: string) => {
        selected = columns;
        selectedColumns.push(columns);
        return query;
      }),
      single: vi.fn(() => Promise.resolve(responseFor(table, selected))),
    };

    return query;
  }

  const supabase = {
    from: vi.fn((table: string) => createQuery(table)),
  };

  const sbAdmin = {
    schema: vi.fn(() => ({
      rpc: initialBalanceRpc,
    })),
  };

  return {
    calculateInterest,
    getAccessibleWallet,
    initialBalanceRpc,
    sbAdmin,
    selectedColumns,
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
    mocks.selectedColumns.length = 0;

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
    mocks.initialBalanceRpc.mockResolvedValue({ data: 750, error: null });
    mocks.calculateInterest.mockReturnValue({
      businessDaysCount: 1,
      dailyResults: [],
      finalBalance: 750,
      nonBusinessDaysCount: 0,
      totalInterest: 0,
    });
  });

  it('loads the initial balance from a private RPC instead of summing transactions in the route', async () => {
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
    expect(mocks.initialBalanceRpc).toHaveBeenCalledWith(
      'get_wallet_interest_initial_balance',
      {
        _actor_id: 'user-1',
        _from_date: '2026-05-01',
        _wallet_id: 'wallet-1',
        _ws_id: 'ws-1',
      }
    );
    expect(mocks.selectedColumns).not.toContain('amount');
    expect(mocks.calculateInterest).toHaveBeenCalledWith(
      expect.objectContaining({
        initialBalance: 750,
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      fromDate: '2026-05-01',
      initialBalance: 750,
      toDate: '2026-05-02',
    });
  });
});
