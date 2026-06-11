import { describe, expect, it, vi } from 'vitest';
import {
  createFinanceInvoice,
  createSubscriptionFinanceInvoice,
  createWalletCheckpoint,
  createWalletCheckpointBatch,
  createWalletInterestConfig,
  deleteInvoice,
  deleteWalletCheckpoint,
  getInvoiceAnalytics,
  getPendingFinanceInvoicesCurrentMonthCount,
  getSubscriptionInvoiceContext,
  getWalletCheckpointSummary,
  importMoneyLoverTransactions,
  listFinanceBalanceTrend,
  listFinanceIncomeExpenseSummary,
  listFinanceInvoices,
  listPendingFinanceInvoices,
  listWalletCheckpoints,
  listWalletRoleAccess,
  updateFinanceInvoice,
  updateWalletCheckpoint,
  updateWalletRoleAccess,
} from './finance';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('finance internal API helpers', () => {
  it('deletes invoices through the centralized workspace finance API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));

    await deleteInvoice('workspace 1', 'invoice/1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/invoice%2F1',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  it('lists wallet role access through the v1 wallet role API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse([]));

    await listWalletRoleAccess('workspace 1', 'wallet/1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/wallets/wallet%2F1/roles',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('updates wallet role viewing windows through the shared helper', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));

    await updateWalletRoleAccess(
      'workspace 1',
      'wallet/1',
      'role/1',
      {
        custom_days: 45,
        viewing_window: 'custom',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/wallets/wallet%2F1/roles/role%2F1',
      expect.objectContaining({
        body: JSON.stringify({
          custom_days: 45,
          viewing_window: 'custom',
        }),
        method: 'PUT',
      })
    );
  });

  it('lists wallet checkpoints with encoded route params and no-store cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [],
        intervals: [],
        latest: null,
      })
    );

    await listWalletCheckpoints(
      'workspace 1',
      'wallet/1',
      { limit: 50 },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/wallets/wallet%2F1/checkpoints?limit=50',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates wallet checkpoints with the shared checkpoint payload', async () => {
    const payload = {
      actual_balance: 1234.56,
      checked_at: '2026-06-11T10:00:00.000Z',
      note: 'Manual audit',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        id: 'checkpoint-1',
      })
    );

    await createWalletCheckpoint('workspace 1', 'wallet/1', payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/wallets/wallet%2F1/checkpoints',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('updates wallet checkpoints through PATCH with encoded checkpoint IDs', async () => {
    const payload = {
      actual_balance: -42.75,
      checked_at: '2026-06-12T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        id: 'checkpoint-1',
      })
    );

    await updateWalletCheckpoint(
      'workspace 1',
      'wallet/1',
      'checkpoint/1',
      payload,
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/wallets/wallet%2F1/checkpoints/checkpoint%2F1',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
  });

  it('deletes wallet checkpoints through the checkpoint route', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));

    await deleteWalletCheckpoint('workspace 1', 'wallet/1', 'checkpoint/1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/wallets/wallet%2F1/checkpoints/checkpoint%2F1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });

  it('gets wallet checkpoint summaries through the workspace route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        latest_checkpoints: [],
        totals_by_currency: [],
        wallets: [],
      })
    );

    await getWalletCheckpointSummary('workspace 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/wallets/checkpoints',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates wallet checkpoint batches with the all-wallet body shape', async () => {
    const payload = {
      checked_at: '2026-06-11T10:00:00.000Z',
      entries: [
        {
          actual_balance: 100,
          note: 'Primary',
          wallet_id: 'wallet/1',
        },
        {
          actual_balance: 200,
          wallet_id: 'wallet/2',
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [],
        totals_by_currency: [],
      })
    );

    await createWalletCheckpointBatch('workspace 1', payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/wallets/checkpoints',
      expect.objectContaining({
        body: JSON.stringify(payload),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('creates wallet interest configs through the centralized helper', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ id: 'config-1' }));

    await createWalletInterestConfig(
      'workspace 1',
      'wallet/1',
      {
        initial_rate: 4.8,
        provider: 'zalopay',
        tracking_start_date: '2026-05-25',
        zalopay_tier: 'gold',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/wallets/wallet%2F1/interest',
      expect.objectContaining({
        body: JSON.stringify({
          initial_rate: 4.8,
          provider: 'zalopay',
          tracking_start_date: '2026-05-25',
          zalopay_tier: 'gold',
        }),
        method: 'POST',
      })
    );
  });

  it('lists invoices with repeated filter params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ count: 0, data: [] }));

    await listFinanceInvoices(
      'workspace 1',
      {
        page: 2,
        pageSize: 25,
        q: 'paid',
        userIds: ['user/1', 'user/2'],
        walletIds: ['wallet/1'],
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices?q=paid&page=2&pageSize=25&userIds=user%2F1&userIds=user%2F2&walletIds=wallet%2F1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists pending invoices and current-month counts through invoice helpers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ count: 0, data: [] }))
      .mockResolvedValueOnce(createJsonResponse(3));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listPendingFinanceInvoices(
      'workspace 1',
      {
        groupByUser: true,
        page: 1,
        pageSize: 10,
        userIds: ['user/1'],
      },
      options
    );
    await getPendingFinanceInvoicesCurrentMonthCount(
      'workspace 1',
      { groupByUser: true },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/pending?page=1&pageSize=10&groupByUser=true&userIds=user%2F1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/pending?groupByUser=true&currentMonthOnly=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('gets invoice analytics with repeated filter params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        creatorData: [],
        endDate: '2026-05-31',
        hasDateRange: true,
        startDate: '2026-05-01',
        walletData: [],
      })
    );

    await getInvoiceAnalytics(
      'workspace 1',
      {
        endDate: '2026-05-31',
        granularity: 'weekly',
        startDate: '2026-05-01',
        userIds: ['user/1', 'user/2'],
        walletIds: ['wallet/1'],
        weekStartsOn: 1,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/analytics?walletIds=wallet%2F1&userIds=user%2F1&userIds=user%2F2&start=2026-05-01&end=2026-05-31&granularity=weekly&weekStartsOn=1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists balance trends through the chart RPC endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        data: [
          {
            balance: 125000,
            date: '2026-05-24',
          },
        ],
      })
    );

    await listFinanceBalanceTrend(
      'workspace 1',
      {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        includeConfidential: false,
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/finance/charts/balance-trend?startDate=2026-05-01&endDate=2026-05-31&includeConfidential=false',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('lists income and expense chart summaries through one RPC endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        closing_balance: 200,
        data: [
          {
            period: '2026-05-24',
            total_expense: 25,
            total_income: 100,
          },
        ],
        opening_balance: 125,
      })
    );

    await listFinanceIncomeExpenseSummary(
      'workspace 1',
      {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
        includeConfidential: false,
        interval: 'daily',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/finance/charts/income-expense-summary?startDate=2026-05-01&endDate=2026-05-31&includeConfidential=false&interval=daily',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('imports Money Lover transactions through the centralized helper', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      body: null,
      ok: true,
      status: 200,
    });

    await importMoneyLoverTransactions(
      'workspace 1',
      [
        {
          amount: '-50000',
          category: 'Food',
          currency: 'VND',
          date: '25/05/2026',
          id: 'row-1',
          note: 'Lunch',
          wallet: 'Cash',
        },
      ],
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/workspaces/workspace%201/transactions/import/money-lover',
      expect.objectContaining({
        body: expect.any(FormData),
        cache: 'no-store',
        method: 'POST',
      })
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((requestInit.body as FormData).get('transactions')).toBe(
      JSON.stringify([
        {
          amount: '-50000',
          category: 'Food',
          currency: 'VND',
          date: '25/05/2026',
          id: 'row-1',
          note: 'Lunch',
          wallet: 'Cash',
        },
      ])
    );
  });

  it('gets subscription invoice context through the shared helper', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        attendance: [],
        latestInvoices: [],
      })
    );

    await getSubscriptionInvoiceContext(
      'workspace 1',
      {
        groupIds: ['group/1', 'group/2'],
        month: '2026-05',
        userId: 'user/1',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/subscription/context?month=2026-05&userId=user%2F1&groupIds=group%2F1&groupIds=group%2F2',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates and updates invoices through centralized mutation helpers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };
    const invoicePayload = {
      category_id: 'category-1',
      content: 'May tuition',
      customer_id: 'user-1',
      frontend_total: 100,
      notes: 'Paid in cash',
      products: [
        {
          category_id: 'category-1',
          price: 100,
          product_id: 'product-1',
          quantity: 1,
          unit_id: 'unit-1',
          warehouse_id: 'warehouse-1',
        },
      ],
      wallet_id: 'wallet-1',
    };

    await createFinanceInvoice('workspace 1', invoicePayload, options);
    await createSubscriptionFinanceInvoice(
      'workspace 1',
      {
        ...invoicePayload,
        customer_id: 'user-1',
        group_ids: ['group-1'],
        selected_month: '2026-05',
      },
      options
    );
    await updateFinanceInvoice(
      'workspace 1',
      'invoice/1',
      {
        note: 'Updated note',
        notice: 'Updated content',
        wallet_id: 'wallet-2',
      },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices',
      expect.objectContaining({
        body: JSON.stringify(invoicePayload),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/subscription',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/invoice%2F1',
      expect.objectContaining({
        body: JSON.stringify({
          note: 'Updated note',
          notice: 'Updated content',
          wallet_id: 'wallet-2',
        }),
        method: 'PUT',
      })
    );
  });
});
