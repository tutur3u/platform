import { describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from './platform';

describe('TuturuuuUserClient', () => {
  it('refreshes before requests when the CLI access token is near expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T00:00:00.000Z'));

    const refreshedSessions: unknown[] = [];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          session: {
            access_token: 'ttr_app_fresh-access-token',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            expires_in: 3600,
            refresh_expires_at: Math.floor(Date.now() / 1000) + 7_776_000,
            refresh_token: 'ttr_app_fresh-refresh-token',
            token_type: 'bearer',
          },
          sessionCreated: true,
          valid: true,
        })
      )
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const client = new TuturuuuUserClient({
      accessToken: 'ttr_app_old-access-token',
      baseUrl: 'https://tuturuuu.com',
      expiresAt: Math.floor(Date.now() / 1000) + 30,
      fetch: fetchMock,
      onSessionRefresh: (session) => {
        refreshedSessions.push(session);
      },
      refreshToken: 'ttr_app_old-refresh-token',
    });

    const response = await client
      .getClientOptions()
      .fetch?.('https://tuturuuu.com/api/v1/workspaces');

    expect(response?.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com/api/cli/auth/refresh',
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: 'ttr_app_old-refresh-token' }),
        method: 'POST',
      })
    );

    const secondCallInit = fetchMock.mock.calls[1]?.[1];
    expect(new Headers(secondCallInit?.headers).get('authorization')).toBe(
      'Bearer ttr_app_fresh-access-token'
    );
    expect(refreshedSessions).toHaveLength(1);

    vi.useRealTimers();
  });

  it('shares one refresh request across concurrent CLI calls', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T00:00:00.000Z'));

    let resolveRefresh:
      | ((response: Response | PromiseLike<Response>) => void)
      | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(refreshResponse)
      .mockResolvedValue(Response.json({ ok: true }));

    const client = new TuturuuuUserClient({
      accessToken: 'ttr_app_old-access-token',
      baseUrl: 'https://tuturuuu.com',
      expiresAt: Math.floor(Date.now() / 1000) + 30,
      fetch: fetchMock,
      refreshToken: 'ttr_app_old-refresh-token',
    });

    const options = client.getClientOptions();
    const firstRequest = options.fetch?.('https://tuturuuu.com/api/v1/a');
    const secondRequest = options.fetch?.('https://tuturuuu.com/api/v1/b');

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveRefresh?.(
      Response.json({
        session: {
          access_token: 'ttr_app_fresh-access-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          refresh_expires_at: Math.floor(Date.now() / 1000) + 7_776_000,
          refresh_token: 'ttr_app_fresh-refresh-token',
          token_type: 'bearer',
        },
        sessionCreated: true,
        valid: true,
      })
    );

    await Promise.all([firstRequest, secondRequest]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requestAuthHeaders = fetchMock.mock.calls
      .slice(1)
      .map(([, init]) => new Headers(init?.headers).get('authorization'));
    expect(requestAuthHeaders).toEqual([
      'Bearer ttr_app_fresh-access-token',
      'Bearer ttr_app_fresh-access-token',
    ]);

    vi.useRealTimers();
  });

  it('passes task-list status filters through task list requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ count: 0, tasks: [] }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.tasks.list('ws-1', {
      includeArchivedBoards: true,
      includeCount: true,
      limit: 5,
      listStatuses: ['not_started', 'active'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/tasks?listStatuses=not_started%2Cactive&limit=5&includeArchivedBoards=true&includeCount=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  it('passes finance requests through the authenticated internal API client', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: 'success' }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.finance.updateTransaction('ws-1', 'tx-1', {
      amount: 125_000,
      origin_wallet_id: 'wallet-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/transactions/tx-1',
      expect.objectContaining({
        body: JSON.stringify({
          amount: 125_000,
          origin_wallet_id: 'wallet-1',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  it('adds pagination metadata to finance transaction exports', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        count: 12,
        data: [{ id: 'transaction-1' }],
      })
    );

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    const response = await client.finance.listTransactionExportRows('ws-1', {
      page: '2',
      pageSize: '5',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/transactions/export?page=2&pageSize=5',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(response.pagination).toEqual({
      hasNextPage: true,
      hasPreviousPage: true,
      limit: 5,
      offset: 5,
      page: 2,
      pageCount: 3,
      pageSize: 5,
      total: 12,
    });
  });

  it('normalizes wrapped finance recurring transaction reads', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          recurringTransactions: [{ id: 'recurring-1', name: 'Rent' }],
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          upcomingTransactions: [{ id: 'upcoming-1', name: 'Rent' }],
        })
      );

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await expect(
      client.finance.listRecurringTransactions('ws-1')
    ).resolves.toEqual([{ id: 'recurring-1', name: 'Rent' }]);
    await expect(
      client.finance.listUpcomingRecurringTransactions('ws-1', {
        daysAhead: 30,
      })
    ).resolves.toEqual([{ id: 'upcoming-1', name: 'Rent' }]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/finance/recurring-transactions',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/finance/recurring-transactions/upcoming?daysAhead=30',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });
});
