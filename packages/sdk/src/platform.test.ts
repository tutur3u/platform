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

  it('routes external project helpers through the workspace API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ ok: true }));
    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });
    const manifest = {
      adapter: 'exocorpse',
      collections: [],
      version: 1,
    };

    await client.external.projects.summary('ws-1');
    await client.external.projects.delivery('ws-1', { preview: true });
    await client.external.projects.collections('ws-1');
    await client.external.projects.entries('ws-1', {
      collectionId: 'characters',
    });
    await client.external.projects.snapshot('ws-1');
    await client.external.projects.setup('ws-1', manifest);
    await client.external.projects.diff('ws-1', manifest);
    await client.external.projects.apply('ws-1', {
      force: true,
      manifest,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/summary',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/delivery?preview=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/collections',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/entries?collectionId=characters',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/sync/snapshot',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/setup',
      expect.objectContaining({
        body: JSON.stringify({ manifest }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/sync/diff',
      expect.objectContaining({
        body: JSON.stringify({ manifest }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/sync/apply',
      expect.objectContaining({
        body: JSON.stringify({
          force: true,
          manifest,
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );

    const requestHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(requestHeaders.get('authorization')).toBe('Bearer access-token');
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
      'https://tasks.tuturuuu.com/api/v1/workspaces/ws-1/tasks?listStatuses=not_started%2Cactive&limit=5&includeArchivedBoards=true&includeCount=true',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  it('manages personal task placements through the authenticated tasks app API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ task: { id: 'task-1' } }))
      .mockResolvedValueOnce(Response.json({ success: true }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.tasks.upsertPersonalPlacement('task-1', {
      personal_board_id: 'board-1',
      personal_list_id: 'list-1',
      terminal_status: 'done',
    });
    await client.tasks.removePersonalPlacement('task-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tasks.tuturuuu.com/api/v1/users/me/tasks/task-1/personal-placement',
      expect.objectContaining({
        body: JSON.stringify({
          personal_board_id: 'board-1',
          personal_list_id: 'list-1',
          terminal_status: 'done',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tasks.tuturuuu.com/api/v1/users/me/tasks/task-1/personal-placement',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('authorization')
    ).toBe('Bearer access-token');
  });

  it('uses configured task app origins for personal placement requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ task: { id: 'task-1' } }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'http://localhost:7803',
      fetch: fetchMock,
    });

    await client.tasks.upsertPersonalPlacement('task-1', {
      personal_board_id: 'board-1',
      personal_list_id: null,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:7809/api/v1/users/me/tasks/task-1/personal-placement',
      expect.objectContaining({
        method: 'PUT',
      })
    );
  });

  it('maps platform localhost requests to first-party app ports', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ count: 0, tasks: [] }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'http://localhost:7803',
      fetch: fetchMock,
    });

    await client.calendar.listEvents('ws-1', {});
    await client.finance.listWallets('ws-1');
    await client.tasks.list('ws-1');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:7806/api/v1/workspaces/ws-1/calendar/events',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:7808/api/v1/workspaces/ws-1/wallets',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:7809/api/v1/workspaces/ws-1/tasks',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('searches tasks through the authenticated task search API', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        tasks: [{ id: 'task-1', name: 'Deadline review', similarity: 0.92 }],
      })
    );

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.tasks.search('ws-1', {
      matchCount: 5,
      matchThreshold: 0.25,
      mode: 'hybrid',
      query: 'deadline review',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tasks.tuturuuu.com/api/v1/workspaces/ws-1/tasks/search',
      expect.objectContaining({
        body: JSON.stringify({
          matchCount: 5,
          matchThreshold: 0.25,
          mode: 'hybrid',
          query: 'deadline review',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  it('passes task description reads and direct updates through the authenticated internal API client', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ description: null, description_yjs_state: null })
      )
      .mockResolvedValueOnce(
        Response.json({ description: null, description_yjs_state: null })
      );

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.tasks.getDescription('ws-1', 'task-1');
    await client.tasks.updateDescription('ws-1', 'task-1', {
      description: '{"type":"doc","content":[{"type":"paragraph"}]}',
      description_yjs_state: [1, 2, 3],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tasks.tuturuuu.com/api/v1/workspaces/ws-1/tasks/task-1/description',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tasks.tuturuuu.com/api/v1/workspaces/ws-1/tasks/task-1/description',
      expect.objectContaining({
        body: JSON.stringify({
          description: '{"type":"doc","content":[{"type":"paragraph"}]}',
          description_yjs_state: [1, 2, 3],
        }),
        method: 'PATCH',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(requestInit?.headers).get('authorization')).toBe(
      'Bearer access-token'
    );
  });

  it('uploads task descriptions through the chunked description API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ session_id: 'session-1' }))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(
        Response.json({
          description: 'Hello',
          description_yjs_state: [1, 2, 3],
        })
      );

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await client.tasks.updateDescriptionChunked('ws-1', 'task-1', {
      description: 'Hello',
      description_yjs_state: [1, 2, 3],
    });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      action: 'begin',
      fields: {
        description: { chunk_count: 1, total_length: 5 },
        description_yjs_state: { chunk_count: 1, total_length: 4 },
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      action: 'append',
      chunk: 'Hello',
      chunk_index: 0,
      field: 'description',
      session_id: 'session-1',
    });
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual({
      action: 'append',
      chunk: 'AQID',
      chunk_index: 0,
      field: 'description_yjs_state',
      session_id: 'session-1',
    });
    expect(JSON.parse(fetchMock.mock.calls[3]?.[1]?.body as string)).toEqual({
      action: 'commit',
      session_id: 'session-1',
    });
  });

  it('aborts chunked task description uploads when appending fails', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ session_id: 'session-1' }))
      .mockResolvedValueOnce(
        Response.json({ error: 'append failed' }, { status: 500 })
      )
      .mockResolvedValueOnce(Response.json({ success: true }));

    const client = new TuturuuuUserClient({
      accessToken: 'access-token',
      baseUrl: 'https://tuturuuu.com',
      fetch: fetchMock,
    });

    await expect(
      client.tasks.updateDescriptionChunked('ws-1', 'task-1', {
        description: 'Hello',
      })
    ).rejects.toThrow();

    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual({
      action: 'abort',
      session_id: 'session-1',
    });
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
      'https://finance.tuturuuu.com/api/workspaces/ws-1/transactions/tx-1',
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
      'https://calendar.tuturuuu.com/api/v1/workspaces/ws-1/calendar/events?start_at=2026-06-11T00%3A00%3A00.000Z&end_at=2026-06-12T00%3A00%3A00.000Z',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://calendar.tuturuuu.com/api/v1/workspaces/ws-1/calendar/events',
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
      'https://calendar.tuturuuu.com/api/v1/workspaces/ws-1/calendars',
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
      'https://calendar.tuturuuu.com/api/v1/calendar/auth/provider-calendars?wsId=ws-1&accountId=account-1',
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
      'https://finance.tuturuuu.com/api/workspaces/ws-1/transfers',
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
      'https://finance.tuturuuu.com/api/workspaces/ws-1/transactions/categories',
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
      'https://finance.tuturuuu.com/api/workspaces/ws-1/tags',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://finance.tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://finance.tuturuuu.com/api/workspaces/ws-1/tags',
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
      'https://finance.tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
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
      'https://finance.tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
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
      'https://finance.tuturuuu.com/api/workspaces/ws%201/wallets/checkpoints',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://finance.tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints?limit=10',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://finance.tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints',
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
      'https://finance.tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://finance.tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints/checkpoint%2F1',
      expect.objectContaining({
        body: JSON.stringify({ actual_balance: 101 }),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      'https://finance.tuturuuu.com/api/workspaces/ws%201/wallets/wallet%2F1/checkpoints/checkpoint%2F1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      7,
      'https://finance.tuturuuu.com/api/workspaces/ws%201/wallets/checkpoints',
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
      'https://finance.tuturuuu.com/api/workspaces/ws-1/transactions/export?page=2&pageSize=5',
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
      'https://finance.tuturuuu.com/api/v1/workspaces/ws-1/finance/recurring-transactions',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://finance.tuturuuu.com/api/v1/workspaces/ws-1/finance/recurring-transactions/upcoming?daysAhead=30',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });
});
