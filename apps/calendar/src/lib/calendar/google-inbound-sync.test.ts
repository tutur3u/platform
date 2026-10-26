import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, type Mock, vi } from 'vitest';

const { sync, refresh } = vi.hoisted(() => ({
  sync: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('./incremental-active-sync', () => ({
  performIncrementalActiveSync: sync,
}));
vi.mock('./token-refresh', () => ({ ensureValidToken: refresh }));
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
const fingerprint = (value: string) =>
  createHash('sha256').update(value).digest('hex');

type Row = Record<string, unknown>;
type Query = Promise<{ data: Row[]; error: null }> & {
  select: () => Query;
  eq: Mock<(column: string, value: unknown) => Query>;
  gte: (column: string, value: string) => Query;
  in: (column: string, values: string[]) => Query;
  limit: () => Query;
};
function database() {
  const tokens: Row[] = ['revoked', 'healthy'].map((id) => ({
    id,
    refresh_token: `test-${id}`,
    access_token: `access-${id}`,
    is_active: true,
    ws_id: 'workspace',
    provider: 'google',
    created_at: '2026-10-26T00:00:00.000001+00:00',
    expires_at: '2099-01-01T00:00:00Z',
  }));
  const filtersSeen: string[] = [];
  function builder(rows: Row[]): Query {
    const filters = new Map<string, unknown>();
    const matches = (row: Row) =>
      [...filters].every(([key, value]) => row[key] === value);
    const result = {
      get data() {
        return rows.filter(matches).map((row) => ({ ...row }));
      },
      error: null,
    };
    const query: Query = Object.assign(Promise.resolve(result), {
      select: () => query,
      eq: vi.fn((column: string, value: unknown) => {
        filtersSeen.push(column);
        filters.set(column, value);
        return query;
      }),
      gte: (column: string, value: string) => {
        rows = rows.filter((row) => String(row[column] ?? '') >= value);
        return query;
      },
      in: (column: string, values: string[]) => {
        rows = rows.filter((row) => values.includes(String(row[column])));
        return query;
      },
      limit: () => query,
    });
    return query;
  }
  // Mirrors public.quarantine_calendar_auth_token.
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => {
    const row = tokens.find(
      (token) => token.id === args.p_token_id && token.ws_id === args.p_ws_id
    );
    if (
      row?.is_active &&
      row.created_at === args.p_observed_created_at &&
      fingerprint(String(row.refresh_token)) === args.p_credential_fingerprint
    ) {
      Object.assign(row, {
        is_active: false,
        deactivated_reason: args.p_reason,
        deactivated_at: new Date().toISOString(),
      });
      return { data: 'deactivated', error: null };
    }
    return {
      data: row && !row.is_active ? 'already_inactive' : 'fenced',
      error: null,
    };
  });
  return {
    from: vi.fn((table: string) =>
      table === 'calendar_auth_tokens'
        ? builder(tokens)
        : builder(
            connections.map((row) => ({
              ws_id: 'workspace',
              is_enabled: true,
              ...row,
            }))
          )
    ),
    rpc,
    tokens,
    filtersSeen,
  };
}
const args = (db: ReturnType<typeof database>) => ({
  sbAdmin: db as never,
  wsId: 'workspace',
  rangeStart: '2026-10-01',
  rangeEnd: '2026-11-01',
  userIdForFallback: 'actor',
  settingsAvailable: true,
});
const synced = { eventsInserted: 1, eventsUpdated: 0, eventsDeleted: 0 };
const invalidGrant = () =>
  Object.assign(new Error('invalid_grant'), {
    response: { status: 400, data: { error: 'invalid_grant' } },
  });

beforeEach(() => {
  refresh.mockImplementation(async (_db, token) => ({
    accessToken: token.access_token,
    expiresAt: null,
    refreshed: false,
  }));
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

it('quarantines a revoked account through the fenced RPC and keeps syncing healthy accounts', async () => {
  const db = database();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sync.mockRejectedValueOnce(invalidGrant()).mockResolvedValue(synced);
  const result = await syncGoogleInbound(args(db));
  expect(sync).toHaveBeenCalledTimes(2);
  expect(db.rpc).toHaveBeenCalledWith('quarantine_calendar_auth_token', {
    p_token_id: 'revoked',
    p_ws_id: 'workspace',
    p_credential_fingerprint: fingerprint('test-revoked'),
    p_observed_created_at: '2026-10-26T00:00:00.000001+00:00',
    p_reason: 'google_invalid_grant',
  });
  expect(JSON.stringify(db.rpc.mock.calls)).not.toContain('test-revoked"');
  expect(db.filtersSeen).not.toContain('refresh_token');
  expect(db.tokens[0]).toMatchObject({
    is_active: false,
    deactivated_reason: 'google_invalid_grant',
  });
  expect(result).toMatchObject({
    inserted: 1,
    failedConnections: 2,
    processedConnections: 1,
    failureType: 'auth',
  });
  expect(result.tokenOutcomes).toEqual([
    expect.objectContaining({
      provider: 'google',
      outcome: 'deactivated',
      reason: 'google_invalid_grant',
    }),
    expect.objectContaining({ provider: 'google', outcome: 'ok' }),
  ]);
});

it('does not retry a quarantined account on the next invocation', async () => {
  const db = database();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sync.mockRejectedValueOnce(invalidGrant()).mockResolvedValue(synced);
  await syncGoogleInbound(args(db));
  sync.mockClear();
  await syncGoogleInbound(args(db));
  expect(sync).toHaveBeenCalledTimes(1);
  expect(sync.mock.calls[0]?.[6]).toBe('healthy');
});

it('never clobbers a concurrent reconnect', async () => {
  const db = database();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sync
    .mockImplementationOnce(async () => {
      Object.assign(db.tokens[0]!, {
        refresh_token: 'replacement-test',
        created_at: '2026-10-26T01:00:00+00:00',
      });
      throw invalidGrant();
    })
    .mockResolvedValue(synced);
  const result = await syncGoogleInbound(args(db));
  expect(db.tokens[0]?.is_active).toBe(true);
  expect(result.tokenOutcomes[0]).toMatchObject({ outcome: 'fenced' });
});

it.each([
  ['a 5xx', { response: { status: 503 } }],
  ['a timeout', { code: 'ETIMEDOUT', message: 'ETIMEDOUT private-secret' }],
  ['rate limiting', { response: { status: 429 } }],
])('keeps %s mid-sync retryable without deactivating', async (_label, raw) => {
  const db = database();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  sync
    .mockRejectedValueOnce(Object.assign(new Error('provider failed'), raw))
    .mockResolvedValue(synced);
  await syncGoogleInbound(args(db));
  expect(sync).toHaveBeenCalledTimes(3);
  expect(db.rpc).not.toHaveBeenCalled();
  expect(db.tokens.every((token) => token.is_active)).toBe(true);
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private-secret');
});

it('records a mid-sync OAuth client failure as systemic without writing', async () => {
  const db = database();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sync
    .mockRejectedValueOnce(
      Object.assign(new Error('invalid_client'), {
        response: { status: 401, data: { error: 'invalid_client' } },
      })
    )
    .mockResolvedValue(synced);
  const result = await syncGoogleInbound(args(db));
  expect(db.rpc).not.toHaveBeenCalled();
  expect(db.tokens.every((token) => token.is_active)).toBe(true);
  expect(result.tokenOutcomes[0]).toMatchObject({
    outcome: 'systemic',
    providerCode: 'invalid_client/http_401',
  });
});

it('skips every calendar of an account whose credential check failed', async () => {
  const db = database();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  refresh.mockImplementation(async (_db, token) =>
    token.id === 'revoked'
      ? {
          accessToken: '',
          expiresAt: null,
          refreshed: false,
          error: 'invalid_grant',
          failure: {
            kind: 'permanent',
            reason: 'google_invalid_grant',
            providerCode: 'invalid_grant/http_400',
          },
          quarantine: 'deactivated',
        }
      : { accessToken: 'ok', expiresAt: null, refreshed: false }
  );
  sync.mockResolvedValue(synced);
  const result = await syncGoogleInbound(args(db));
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(sync).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ failedConnections: 2, failureType: 'auth' });
  expect(result.tokenOutcomes[0]).toMatchObject({
    outcome: 'deactivated',
    providerCode: 'invalid_grant/http_400',
  });
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
