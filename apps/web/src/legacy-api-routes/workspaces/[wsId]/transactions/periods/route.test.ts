import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getFinanceRouteContext = vi.fn();
  const resolveFinanceRouteAuthContext = vi.fn();
  const rpc = vi.fn();
  const serverLoggerError = vi.fn();
  const serverLoggerWarn = vi.fn();
  const withoutPermission = vi.fn();

  return {
    getFinanceRouteContext,
    resolveFinanceRouteAuthContext,
    rpc,
    serverLoggerError,
    serverLoggerWarn,
    withoutPermission,
  };
});

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@/lib/finance-route-auth', () => ({
  resolveFinanceRouteAuthContext: (
    ...args: Parameters<typeof mocks.resolveFinanceRouteAuthContext>
  ) => mocks.resolveFinanceRouteAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
    warn: (...args: Parameters<typeof mocks.serverLoggerWarn>) =>
      mocks.serverLoggerWarn(...args),
  },
}));

const periodTransaction = {
  amount: 125000,
  category: 'Income',
  category_color: '#22c55e',
  category_icon: 'wallet',
  category_id: 'category-1',
  created_at: '2026-06-11T00:00:00.000Z',
  creator_id: null,
  description: 'Income transaction',
  id: 'tx-1',
  is_amount_confidential: false,
  is_category_confidential: false,
  is_description_confidential: false,
  platform_creator_id: null,
  report_opt_in: true,
  taken_at: '2026-06-11T00:00:00.000Z',
  wallet: 'Main Wallet',
  wallet_id: 'wallet-1',
  ws_id: 'ws-1',
};

describe('workspace transaction periods route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.withoutPermission.mockReturnValue(false);
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({
      type: 'session',
    });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: mocks.withoutPermission,
        },
        supabase: {
          rpc: mocks.rpc,
        },
        user: {
          id: 'user-1',
        },
      },
    });
  });

  it('falls back to period transactions without tags when enrichment is unavailable', async () => {
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'get_transactions_by_period') {
        return {
          data: [
            {
              has_more: false,
              has_redacted_amounts: false,
              net_total: 125000,
              period_end: '2026-06-30T23:59:59.999Z',
              period_start: '2026-06-01T00:00:00.000Z',
              total_expense: 0,
              total_income: 125000,
              transaction_count: 1,
              transactions: [periodTransaction],
            },
          ],
          error: null,
        };
      }

      if (functionName === 'get_transaction_list_enrichment') {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message:
              'Could not find the function public.get_transaction_list_enrichment in the schema cache',
          },
        };
      }

      return { data: null, error: new Error(`Unexpected RPC ${functionName}`) };
    });

    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/transactions/periods/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions/periods?viewMode=monthly'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          hasRedactedAmounts: false,
          netTotal: 125000,
          transactions: [
            {
              id: 'tx-1',
              tags: [],
              wallet: 'Main Wallet',
            },
          ],
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
    expect(response.status).toBe(200);
    expect(mocks.serverLoggerWarn).toHaveBeenCalledWith(
      'Transaction list enrichment unavailable; continuing without enrichment',
      expect.objectContaining({
        normalizedWsId: 'ws-1',
        route: 'transactions/periods',
        transactionCount: 1,
      })
    );
  });
});
