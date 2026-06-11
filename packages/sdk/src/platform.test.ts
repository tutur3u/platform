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

  it('does not expose the bearer token through default headers', () => {
    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
    });

    const headers = new Headers(client.getClientOptions().defaultHeaders);

    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-sdk-client')).toBe('tuturuuu-cli');
  });

  it('does not attach or refresh CLI auth for cross-origin fetch requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T00:00:00.000Z'));

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ok: true }));

    const client = new TuturuuuUserClient({
      accessToken: 'ttr_app_old-access-token',
      baseUrl: 'https://tuturuuu.com',
      expiresAt: Math.floor(Date.now() / 1000) + 30,
      fetch: fetchMock,
      refreshToken: 'ttr_app_old-refresh-token',
    });

    await client.getClientOptions().fetch?.('https://example.com/collect', {
      headers: {
        Authorization: 'Bearer caller-provided-token',
        'X-Request-ID': 'request-1',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/collect',
      expect.any(Object)
    );
    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get('authorization')).toBeNull();
    expect(requestHeaders.get('x-request-id')).toBe('request-1');

    vi.useRealTimers();
  });

  it('does not refresh or retry cross-origin 401 responses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T00:00:00.000Z'));

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Unauthorized', { status: 401 }));

    const client = new TuturuuuUserClient({
      accessToken: 'ttr_app_old-access-token',
      baseUrl: 'https://tuturuuu.com',
      expiresAt: Math.floor(Date.now() / 1000) + 30,
      fetch: fetchMock,
      refreshToken: 'ttr_app_old-refresh-token',
    });

    const response = await client
      .getClientOptions()
      .fetch?.('https://example.com/unauthorized');

    expect(response?.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('still attaches refreshed CLI auth for relative platform requests', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T00:00:00.000Z'));

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
      refreshToken: 'ttr_app_old-refresh-token',
    });

    await client.getClientOptions().fetch?.('/api/v1/workspaces');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers);
    expect(requestHeaders.get('authorization')).toBe(
      'Bearer ttr_app_fresh-access-token'
    );

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

  it('passes calendar requests through the authenticated internal API client', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ message: 'success' }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.calendar.listEvents('ws-1', {
      start_at: '2026-06-11T00:00:00.000Z',
      end_at: '2026-06-12T00:00:00.000Z',
    });
    await client.calendar.createEvent('ws-1', {
      title: 'Focus block',
      start_at: '2026-06-11T02:00:00.000Z',
      end_at: '2026-06-11T03:00:00.000Z',
    });
    await client.calendar.createCalendar('ws-1', {
      name: 'Team',
      color: 'BLUE',
    });
    await client.calendar.listProviderCalendars('ws-1', {
      accountId: 'account-1',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/calendar/events?start_at=2026-06-11T00%3A00%3A00.000Z&end_at=2026-06-12T00%3A00%3A00.000Z',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/calendar/events',
      expect.objectContaining({
        body: JSON.stringify({
          title: 'Focus block',
          start_at: '2026-06-11T02:00:00.000Z',
          end_at: '2026-06-11T03:00:00.000Z',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/calendars',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Team',
          color: 'BLUE',
        }),
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://tuturuuu.com/api/v1/calendar/auth/provider-calendars?wsId=ws-1&accountId=account-1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  it('passes finance transfer migration requests through the authenticated internal API client', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: 'success' }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.finance.migrateTransfer('ws-1', {
      origin_transaction_id: 'origin-tx',
      destination_transaction_id: 'destination-tx',
      origin_wallet_id: 'origin-wallet',
      destination_wallet_id: 'destination-wallet',
      amount: 125_000,
      destination_amount: 126_000,
      description: 'Migrated transfer',
      taken_at: '2026-03-30T08:00:00.000Z',
      tag_ids: ['tag-1'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/transfers',
      expect.objectContaining({
        body: JSON.stringify({
          origin_transaction_id: 'origin-tx',
          destination_transaction_id: 'destination-tx',
          origin_wallet_id: 'origin-wallet',
          destination_wallet_id: 'destination-wallet',
          amount: 125_000,
          destination_amount: 126_000,
          description: 'Migrated transfer',
          taken_at: '2026-03-30T08:00:00.000Z',
          tag_ids: ['tag-1'],
        }),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  it('passes category descriptions through finance category creation', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: 'success' }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.finance.createTransactionCategory('ws-1', {
      name: 'Travel',
      description: 'Trips and commuting',
      is_expense: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/transactions/categories',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Travel',
          description: 'Trips and commuting',
          is_expense: true,
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('supports finance tag CRUD helpers', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(Response.json({ ok: true })));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.finance.listTags('ws-1');
    await client.finance.getTag('ws-1', 'tag-1');
    await client.finance.createTag('ws-1', {
      name: 'Tuturuuu',
      color: '#9ef0ff',
      description: 'Platform costs',
    });
    await client.finance.updateTag('ws-1', 'tag-1', {
      description: 'Investment platform costs',
    });
    await client.finance.deleteTag('ws-1', 'tag-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com/api/workspaces/ws-1/tags',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://tuturuuu.com/api/workspaces/ws-1/tags',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Tuturuuu',
          color: '#9ef0ff',
          description: 'Platform costs',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
      expect.objectContaining({
        body: JSON.stringify({
          description: 'Investment platform costs',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });

  it('supports finance wallet checkpoint helpers', async () => {
    const checkpoint = {
      actual_balance: 100,
      checked_at: '2026-06-11T00:00:00.000Z',
      id: 'checkpoint/1',
      wallet_id: 'wallet/1',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          latest_checkpoints: [],
          totals_by_currency: [],
          wallets: [],
        })
      )
      .mockResolvedValueOnce(
        Response.json({ data: [], intervals: [], latest: null })
      )
      .mockResolvedValueOnce(Response.json(checkpoint))
      .mockResolvedValueOnce(
        Response.json({ data: [checkpoint], intervals: [], latest: checkpoint })
      )
      .mockResolvedValueOnce(
        Response.json({ ...checkpoint, actual_balance: 101 })
      )
      .mockResolvedValueOnce(Response.json({ message: 'Checkpoint deleted' }))
      .mockResolvedValueOnce(
        Response.json({ data: [checkpoint], totals_by_currency: [] })
      );

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.finance.getWalletCheckpointSummary('ws 1');
    await client.finance.listWalletCheckpoints('ws 1', 'wallet/1', {
      limit: 10,
    });
    await client.finance.createWalletCheckpoint('ws 1', 'wallet/1', {
      actual_balance: 100,
      checked_at: '2026-06-11T00:00:00.000Z',
      note: 'Monthly audit',
    });
    await client.finance.getWalletCheckpoint(
      'ws 1',
      'wallet/1',
      'checkpoint/1'
    );
    await client.finance.updateWalletCheckpoint(
      'ws 1',
      'wallet/1',
      'checkpoint/1',
      {
        actual_balance: 101,
      }
    );
    await client.finance.deleteWalletCheckpoint(
      'ws 1',
      'wallet/1',
      'checkpoint/1'
    );
    await client.finance.createWalletCheckpointBatch('ws 1', {
      checked_at: '2026-06-11T00:00:00.000Z',
      entries: [{ actual_balance: 100, wallet_id: 'wallet/1' }],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com/api/workspaces/ws%201/wallets/checkpoints',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints?limit=10',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints',
      expect.objectContaining({
        body: JSON.stringify({
          actual_balance: 100,
          checked_at: '2026-06-11T00:00:00.000Z',
          note: 'Monthly audit',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints/checkpoint%2F1',
      expect.objectContaining({
        body: JSON.stringify({ actual_balance: 101 }),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'https://tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints/checkpoint%2F1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'https://tuturuuu.com/api/workspaces/ws%201/wallets/checkpoints',
      expect.objectContaining({
        body: JSON.stringify({
          checked_at: '2026-06-11T00:00:00.000Z',
          entries: [{ actual_balance: 100, wallet_id: 'wallet/1' }],
        }),
        cache: 'no-store',
        method: 'POST',
      })
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
