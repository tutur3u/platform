import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { refresh, fetchEvents, graph, syncGraph, reconcile, convert } =
  vi.hoisted(() => ({
    refresh: vi.fn(),
    fetchEvents: vi.fn(),
    graph: vi.fn(),
    syncGraph: vi.fn(),
    reconcile: vi.fn(),
    convert: vi.fn(),
  }));
vi.mock('@tuturuuu/microsoft', () => ({ createGraphClient: graph }));
vi.mock('@tuturuuu/microsoft/calendar', () => ({
  fetchMicrosoftEvents: fetchEvents,
  convertMicrosoftEventToWorkspaceFormat: convert,
}));
vi.mock('./provider-sync-network', () => ({
  createSyncGraphClient: syncGraph,
}));
vi.mock('./token-refresh', () => ({ ensureValidToken: refresh }));
vi.mock('./recurrence/provider/inbound/graph-connection', () => ({
  reconcileGraphConnectionSeries: reconcile,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { syncMicrosoftInbound } from './microsoft-inbound-sync';
import { withProviderSyncBudget } from './provider-sync-budget';
import { CalendarProviderSyncError } from './sync-errors';

type Connection = {
  id: string;
  calendar_id: string;
  calendar_name?: string;
  sync_delete_enabled?: boolean;
};
function database(
  tokens: Array<{ id: string; provider?: string }> = [{ id: 'account' }],
  connections: Record<string, Connection[]> = {
    account: [
      { id: 'a', calendar_id: 'a', sync_delete_enabled: false },
      { id: 'b', calendar_id: 'b', sync_delete_enabled: false },
    ],
  }
) {
  const deletedCalendars: unknown[] = [];
  const upsert = vi.fn(() => ({
    select: async (): Promise<{ data: never[]; error: Error | null }> => ({
      data: [],
      error: null,
    }),
  }));
  const eventReads: unknown[] = [];
  function builder(table: string) {
    const filters = new Map<string, unknown>();
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        filters.set(key, value);
        return query;
      },
      gte: () => query,
      lte: () => query,
      get data() {
        if (table === 'calendar_auth_tokens') return tokens;
        if (table === 'calendar_connections')
          return connections[String(filters.get('auth_token_id'))] ?? [];
        const calendar = filters.get('external_calendar_id');
        eventReads.push(calendar);
        return [{ id: String(calendar), external_event_id: 'stale-event' }];
      },
      error: null,
      upsert,
      delete: () => ({
        in: async (_key: string, ids: unknown[]) => {
          deletedCalendars.push(...ids);
          return { error: null };
        },
      }),
    };
    return query;
  }
  return { from: vi.fn(builder), deletedCalendars, eventReads, upsert };
}
function run(db: ReturnType<typeof database>) {
  return syncMicrosoftInbound({
    sbAdmin: db as never,
    wsId: 'workspace',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-11-01',
    settingsAvailable: true,
  });
}
beforeEach(() => {
  refresh.mockResolvedValue({ accessToken: 'test-token' });
  fetchEvents.mockResolvedValue([]);
  reconcile.mockImplementation(async (args) => args.legacyEvents);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

it('records a rejected Microsoft account and continues to a healthy account', async () => {
  const db = database(
    [
      { id: 'bad', provider: 'microsoft' },
      { id: 'good', provider: 'microsoft' },
    ],
    {
      bad: [{ id: 'a', calendar_id: 'a', sync_delete_enabled: false }],
      good: [{ id: 'b', calendar_id: 'b', sync_delete_enabled: false }],
    }
  );
  refresh.mockResolvedValueOnce({
    error: 'invalid_grant',
    failure: {
      kind: 'permanent',
      reason: 'microsoft_invalid_grant',
      providerCode: 'invalid_grant/AADSTS70008',
    },
    quarantine: 'deactivated',
  });
  const result = await run(db);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(fetchEvents).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    processedAccounts: 1,
    failedAccounts: 1,
    failureType: 'auth',
    tokenOutcomes: [
      {
        provider: 'microsoft',
        outcome: 'deactivated',
        reason: 'microsoft_invalid_grant',
      },
      { provider: 'microsoft', outcome: 'ok' },
    ],
  });
  expect(JSON.stringify(result.tokenOutcomes)).not.toContain('bad');
});

it.each([
  [{ kind: 'permanent', reason: 'microsoft_consent_revoked' }, 'auth'],
  [{ kind: 'systemic', providerCode: 'invalid_client' }, 'configuration'],
  [{ kind: 'transient', providerCode: 'http_503' }, 'network'],
])('classifies refresh failure %o as %s', async (failure, failureType) => {
  refresh.mockResolvedValue({ error: 'refresh failed', failure });
  expect(await run(database())).toMatchObject({
    failedAccounts: 1,
    failureType,
  });
  expect(graph).not.toHaveBeenCalled();
  expect(fetchEvents).not.toHaveBeenCalled();
});

it('bounds accounts and connections, uses cancellable Graph, and reports unnamed calendar failures', async () => {
  const tokens = Array.from({ length: 22 }, (_, i) => ({
    id: `account-${String(i).padStart(2, '0')}`,
  }));
  const connections = Object.fromEntries(
    tokens.map(({ id }, i) => [
      id,
      Array.from({ length: i === 0 ? 21 : 1 }, (_, j) => ({
        id: `${id}-${String(j).padStart(2, '0')}`,
        calendar_id: `calendar-${j}`,
        sync_delete_enabled: false,
      })),
    ])
  );
  const db = database(tokens, connections);
  vi.spyOn(Date, 'now').mockReturnValue(0);
  fetchEvents.mockRejectedValueOnce(
    new CalendarProviderSyncError('Calendar not found', 'not_found')
  );
  const result = await withProviderSyncBudget(
    new AbortController().signal,
    () => run(db)
  );
  expect(result).toMatchObject({
    deferredAccounts: 2,
    deferredConnections: 20,
    failedAccounts: 1,
    processedAccounts: 0,
    failedCalendars: [
      {
        connectionId: 'account-00-00',
        calendarName: 'Microsoft calendar',
        code: 'not_found',
      },
    ],
  });
  expect(fetchEvents).toHaveBeenCalledTimes(20);
  expect(
    db.from.mock.calls.filter(([table]) => table === 'calendar_connections')
  ).toHaveLength(20);
  expect(graph).not.toHaveBeenCalled();
  expect(syncGraph).toHaveBeenCalledTimes(1);
  expect(syncGraph).toHaveBeenCalledWith('test-token');
});

it.each([
  'not_found',
  'access_denied',
  'network',
  'configuration',
  'unknown',
] as const)(
  'continues sibling calendars after %s and retains the failed account',
  async (code) => {
    fetchEvents.mockRejectedValueOnce(
      new CalendarProviderSyncError('private-provider-message', code)
    );
    const result = await run(database());
    expect(fetchEvents.mock.calls.map((call) => call[1])).toEqual(['a', 'b']);
    expect(result).toMatchObject({
      failedAccounts: 1,
      processedAccounts: 0,
      failureType: code,
      failedCalendars: [
        { connectionId: 'a', calendarName: 'Microsoft calendar', code },
      ],
    });
  }
);

it.each(['auth', 'api_limit'] as const)(
  'stops siblings for %s while continuing the next account',
  async (code) => {
    fetchEvents.mockRejectedValueOnce(
      new CalendarProviderSyncError('private-provider-message', code)
    );
    const db = database([{ id: 'account' }, { id: 'next' }], {
      account: [
        { id: 'a', calendar_id: 'a' },
        { id: 'b', calendar_id: 'b' },
      ],
      next: [{ id: 'c', calendar_id: 'c', sync_delete_enabled: false }],
    });
    expect(await run(db)).toMatchObject({
      failedAccounts: 1,
      processedAccounts: 1,
      failureType: code,
    });
    expect(fetchEvents.mock.calls.map((call) => call[1])).toEqual(['a', 'c']);
    expect(db.deletedCalendars).toEqual([]);
  }
);

it.each([false, true])(
  'defers accounts on budget abort without provider failures (in flight: %s)',
  async (inFlight) => {
    const controller = new AbortController();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const abort = () =>
      controller.abort(new DOMException('deadline', 'TimeoutError'));
    if (!inFlight) abort();
    fetchEvents.mockImplementation(async () => {
      abort();
      controller.signal.throwIfAborted();
    });
    const db = database([{ id: 'account' }, { id: 'next' }]);
    const result = await withProviderSyncBudget(controller.signal, () =>
      run(db)
    );
    expect(result).toMatchObject({
      processedAccounts: 0,
      failedAccounts: 0,
      deferredAccounts: 2,
      deferredConnections: inFlight ? 2 : 0,
      failedCalendars: [],
      failureType: null,
    });
    expect(fetchEvents).toHaveBeenCalledTimes(inFlight ? 1 : 0);
    expect(refresh).toHaveBeenCalledTimes(inFlight ? 1 : 0);
    expect(db.deletedCalendars).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  }
);

it.each(['fetch', 'reconcile', 'upsert'])(
  'never deletes a calendar after failed %s, but syncs its sibling',
  async (stage) => {
    const db = database([{ id: 'account' }], {
      account: [
        { id: 'a', calendar_id: 'a' },
        { id: 'b', calendar_id: 'b' },
      ],
    });
    const error = new CalendarProviderSyncError(
      'private-provider-message',
      'network'
    );
    if (stage === 'fetch') fetchEvents.mockRejectedValueOnce(error);
    if (stage === 'reconcile') reconcile.mockRejectedValueOnce(error);
    if (stage === 'upsert') {
      fetchEvents.mockResolvedValueOnce([
        { id: 'event', subject: 'Event', start: {}, end: {} },
      ]);
      convert.mockReturnValue({
        title: 'Event',
        start_at: '2026-10-01',
        end_at: '2026-10-02',
      });
      db.upsert.mockReturnValueOnce({
        select: async () => ({ data: [], error }),
      });
    }
    expect(await run(db)).toMatchObject({ failedAccounts: 1, deleted: 1 });
    expect(db.eventReads).toEqual(['b']);
    expect(db.deletedCalendars).toEqual(['b']);
  }
);

it('retains a real calendar failure observed before a later budget abort', async () => {
  const controller = new AbortController();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchEvents
    .mockRejectedValueOnce(
      new CalendarProviderSyncError('Calendar not found', 'not_found')
    )
    .mockImplementationOnce(async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    });
  const result = await withProviderSyncBudget(controller.signal, () =>
    run(database([{ id: 'account' }, { id: 'next' }]))
  );
  expect(result).toMatchObject({
    failedAccounts: 1,
    deferredAccounts: 2,
    deferredConnections: 1,
    failureType: 'not_found',
    failedCalendars: [
      {
        connectionId: 'a',
        calendarName: 'Microsoft calendar',
        code: 'not_found',
      },
    ],
  });
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn).toHaveBeenCalledWith('Microsoft calendar account sync failed', {
    wsId: 'workspace',
    authTokenId: 'account',
    code: 'not_found',
  });
});
