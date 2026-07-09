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

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
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

const transaction = {
  amount: 125000,
  category_color: '#22c55e',
  category_icon: 'wallet',
  category_id: 'category-1',
  category_name: 'Income',
  created_at: '2026-06-11T00:00:00.000Z',
  creator_avatar_url: null,
  creator_email: 'creator@example.com',
  creator_full_name: 'Creator',
  creator_id: 'creator-1',
  description: 'Income transaction',
  id: 'tx-1',
  invoice_id: null,
  is_amount_confidential: false,
  is_category_confidential: false,
  is_description_confidential: false,
  platform_creator_id: null,
  report_opt_in: true,
  taken_at: '2026-06-11T00:00:00.000Z',
  total_count: null,
  wallet_id: 'wallet-1',
  wallet_name: 'Main Wallet',
};

describe('workspace transactions infinite route', () => {
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

  it('returns enriched transactions from the enrichment RPC', async () => {
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'get_wallet_transactions_with_permissions') {
        return { data: [transaction], error: null };
      }

      if (functionName === 'get_transaction_list_enrichment') {
        return {
          data: [
            {
              tags: [
                {
                  color: '#22c55e',
                  id: 'tag-1',
                  name: 'Salary',
                },
              ],
              transaction_id: 'tx-1',
              transfer: {
                is_origin: true,
                linked_amount: -125000,
                linked_amount_redacted: false,
                linked_is_amount_confidential: false,
                linked_transaction_id: 'tx-2',
                linked_wallet_currency: 'VND',
                linked_wallet_id: 'wallet-2',
                linked_wallet_name: 'Savings',
              },
              wallet_currency: 'VND',
              wallet_icon: 'wallet',
              wallet_image_src: null,
            },
          ],
          error: null,
        };
      }

      return { data: null, error: new Error(`Unexpected RPC ${functionName}`) };
    });

    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/transactions/infinite/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions/infinite?limit=20'
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
          id: 'tx-1',
          tags: [
            {
              color: '#22c55e',
              id: 'tag-1',
              name: 'Salary',
            },
          ],
          transfer: {
            is_origin: true,
            linked_amount: -125000,
            linked_amount_redacted: false,
            linked_is_amount_confidential: false,
            linked_transaction_id: 'tx-2',
            linked_wallet_id: 'wallet-2',
            linked_wallet_name: 'Savings',
          },
          wallet: 'Main Wallet',
          wallet_currency: 'VND',
          wallet_icon: 'wallet',
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
    expect(response.status).toBe(200);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('falls back to base transactions when enrichment is permission-denied during rollout', async () => {
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'get_wallet_transactions_with_permissions') {
        return { data: [transaction], error: null };
      }

      if (functionName === 'get_transaction_list_enrichment') {
        return {
          data: null,
          error: {
            code: 'P0001',
            message: 'Permission denied',
          },
        };
      }

      return { data: null, error: new Error(`Unexpected RPC ${functionName}`) };
    });

    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/transactions/infinite/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions/infinite?limit=20'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      id: 'tx-1',
      tags: [],
      wallet: 'Main Wallet',
    });
    expect(body.data[0]).not.toHaveProperty('wallet_currency');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Transaction list enrichment unavailable; continuing without enrichment',
      expect.objectContaining({
        normalizedWsId: 'ws-1',
        route: 'transactions/infinite',
        transactionCount: 1,
      })
    );
  });

  it('keeps main transaction RPC failures fatal', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: new Error('main transaction list failed'),
    });

    const { GET } = await import(
      '@/legacy-api-routes/workspaces/[wsId]/transactions/infinite/route'
    );

    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions/infinite?limit=20'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    await expect(response.json()).resolves.toEqual({
      message: 'main transaction list failed',
    });
    expect(response.status).toBe(500);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error fetching transactions',
      {
        error: expect.any(Error),
      }
    );
  });
});
