import { afterEach, expect, it, type Mock, vi } from 'vitest';

const { sync } = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock('./incremental-active-sync', () => ({
  performIncrementalActiveSync: sync,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { syncGoogleInbound } from './google-inbound-sync';
import { withProviderSyncBudget } from './provider-sync-budget';

const connections = [
  { id: 'a', calendar_name: 'A', calendar_id: 'a', auth_token_id: 'revoked' },
  { id: 'b', calendar_name: 'B', calendar_id: 'b', auth_token_id: 'revoked' },
  { id: 'c', calendar_name: 'C', calendar_id: 'c', auth_token_id: 'healthy' },
];

type Row = Record<string, unknown>;
type Query = Promise<{ data: Row[]; error: null }> & {
  select: () => Query;
  eq: Mock<(column: string, value: unknown) => Query>;
  in: (column: string, values: string[]) => Query;
};
function database() {
  const tokens = [
    {
      id: 'revoked',
      refresh_token: 'test-revoked',
      is_active: true,
      ws_id: 'workspace',
      provider: 'google',
    },
    {
      id: 'healthy',
      refresh_token: 'test-healthy',
      is_active: true,
      ws_id: 'workspace',
      provider: 'google',
    },
  ];
  const updateQueries: Query[] = [];
  function builder(rows: Row[], patch?: Row): Query {
    const filters = new Map<string, unknown>();
    const matches = (row: Row) =>
      [...filters].every(([key, value]) => row[key] === value);
    const result = {
      get data() {
        return rows.filter(matches).map((row) => ({ ...row }));
      },
      get error(): null {
        if (patch)
          rows.filter(matches).forEach((row) => {
            Object.assign(row, patch);
          });
        return null;
      },
    };
    const query: Query = Object.assign(Promise.resolve(result), {
      select: () => query,
      eq: vi.fn((column: string, value: unknown) => {
        filters.set(column, value);
        return query;
      }),
      in: (column: string, values: string[]) => {
        const matching = rows.filter((row) =>
          values.includes(String(row[column]))
        );
        rows = matching;
        return query;
      },
    });
    return query;
  }
  const update = vi.fn((patch: Row) => {
    const query = builder(tokens, patch);
    updateQueries.push(query);
    return query;
  });
  return {
    from: vi.fn((table: string) =>
      table === 'calendar_auth_tokens'
        ? Object.assign(builder(tokens), { update })
        : builder(
            connections.map((row) => ({
              ws_id: 'workspace',
              is_enabled: true,
              ...row,
            }))
          )
    ),
    update,
    updateQueries,
    tokens,
  };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});
it('stops revoked consent durably and skips sibling calendars while syncing healthy accounts', async () => {
  const db = database();
  sync.mockRejectedValueOnce(new Error('invalid_grant')).mockResolvedValue({
    eventsInserted: 1,
    eventsUpdated: 0,
    eventsDeleted: 0,
  });
  const result = await syncGoogleInbound({
    sbAdmin: db as never,
    wsId: 'workspace',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-11-01',
    userIdForFallback: 'actor',
    settingsAvailable: true,
  });
  expect(sync).toHaveBeenCalledTimes(2);
  expect(db.update).toHaveBeenCalledWith({ is_active: false });
  expect(db.updateQueries[0]?.eq).toHaveBeenCalledWith('id', 'revoked');
  expect(db.updateQueries[0]?.eq).toHaveBeenCalledWith('ws_id', 'workspace');
  expect(db.updateQueries[0]?.eq).toHaveBeenCalledWith(
    'refresh_token',
    'test-revoked'
  );
  expect(db.tokens[0]?.is_active).toBe(false);
  expect(result).toMatchObject({
    inserted: 1,
    failedConnections: 2,
    processedConnections: 1,
    failureType: 'auth',
  });
});

it('does not retry revoked consent after a fresh invocation reads durable state', async () => {
  const db = database();
  sync.mockRejectedValueOnce(new Error('invalid_grant')).mockResolvedValue({
    eventsInserted: 0,
    eventsUpdated: 0,
    eventsDeleted: 0,
  });
  const args = {
    sbAdmin: db as never,
    wsId: 'workspace',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-11-01',
    userIdForFallback: 'actor',
    settingsAvailable: true,
  };
  await syncGoogleInbound(args);
  sync.mockClear();
  await syncGoogleInbound(args);
  expect(sync).toHaveBeenCalledTimes(1);
  expect(sync.mock.calls[0]?.[6]).toBe('healthy');
});
it('does not disable a credential replaced while the rejected request was in flight', async () => {
  const db = database();
  sync
    .mockImplementationOnce(async () => {
      db.tokens[0]!.refresh_token = 'replacement-test';
      throw new Error('invalid_grant');
    })
    .mockResolvedValue({
      eventsInserted: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
    });
  await syncGoogleInbound({
    sbAdmin: db as never,
    wsId: 'workspace',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-11-01',
    userIdForFallback: 'actor',
    settingsAvailable: true,
  });
  expect(db.tokens[0]?.is_active).toBe(true);
});
it('keeps a transient provider failure retryable and logs no raw provider payload', async () => {
  const db = database();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  sync
    .mockRejectedValueOnce(new Error('ETIMEDOUT private-provider-secret'))
    .mockResolvedValue({
      eventsInserted: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
    });
  await syncGoogleInbound({
    sbAdmin: db as never,
    wsId: 'workspace',
    rangeStart: '2026-10-01',
    rangeEnd: '2026-11-01',
    userIdForFallback: 'actor',
    settingsAvailable: true,
  });
  expect(sync).toHaveBeenCalledTimes(3);
  expect(db.update).not.toHaveBeenCalled();
  expect(JSON.stringify(warn.mock.calls)).not.toContain(
    'private-provider-secret'
  );
});

it.each([false, true])(
  'defers unattempted Google connections on cancellation (in flight: %s)',
  async (inFlight) => {
    const controller = new AbortController();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const abort = () =>
      controller.abort(
        new DOMException('Calendar sync timed out', 'TimeoutError')
      );
    if (!inFlight) abort();
    sync.mockImplementation(async () => {
      abort();
      controller.signal.throwIfAborted();
    });
    const result = await withProviderSyncBudget(controller.signal, () =>
      syncGoogleInbound({
        sbAdmin: database() as never,
        wsId: 'workspace',
        rangeStart: '2026-10-01',
        rangeEnd: '2026-11-01',
        userIdForFallback: 'actor',
        settingsAvailable: true,
      })
    );
    expect(sync).toHaveBeenCalledTimes(inFlight ? 1 : 0);
    expect(result).toMatchObject({
      processedConnections: 0,
      failedConnections: inFlight ? 1 : 0,
      deferredConnections: inFlight ? 2 : 3,
      failureType: inFlight ? 'network' : null,
    });
    expect(result.failedCalendars).toHaveLength(inFlight ? 1 : 0);
    expect(warn).toHaveBeenCalledTimes(inFlight ? 1 : 0);
  }
);
