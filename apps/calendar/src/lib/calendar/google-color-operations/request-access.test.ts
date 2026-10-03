import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ credentials: vi.fn() }));
vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: class {
    setCredentials = m.credentials;
  },
  google: { calendar: vi.fn(() => ({})) },
}));
vi.mock('../../calendar-event-permission', () => ({
  authorizeCalendarEventManagement: vi.fn(),
}));
vi.mock('../source-resolver', () => ({
  resolveCalendarSourceForEvent: vi.fn(),
  resolveCalendarSource: vi.fn(),
}));

import { createRequestColorOperationAccess } from './request-access';

function fixture(operationId?: string) {
  vi.clearAllMocks();
  const rows: Record<string, unknown> = {
    workspace_calendar_events: {
      provider: 'google',
      external_event_id: 'provider-event',
      external_calendar_id: 'calendar',
    },
    calendar_connections: { auth_token_id: 'token' },
    calendar_auth_tokens: {
      id: 'token',
      access_token: 'verified-fixture',
      refresh_token: null,
    },
  };
  const predicates: Record<string, unknown[][]> = {};
  const sbAdmin = {
    rpc: vi.fn(async () => ({ data: null as unknown, error: null as unknown })),
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          predicates[table] ??= [];
          predicates[table].push([column, value]);
          return query;
        },
        maybeSingle: async () => ({ data: rows[table], error: null }),
      };
      return query;
    },
  };
  const authorize = vi.fn(async () => ({
    wsId: 'workspace',
    userId: 'actor',
    sbAdmin,
  }));
  const resolveSource = vi.fn(async () => ({
    provider: 'google',
    connectionId: 'connection',
    externalCalendarId: 'calendar',
    accessToken: 'old-fixture',
    refreshToken: null,
    workspaceCalendarId: null,
    label: 'calendar',
    color: null,
    accessRole: 'writer',
    accountEmail: null,
    accountName: null,
  }));
  const resolveConnection = vi.fn(async () => resolveSource());
  const access = createRequestColorOperationAccess(
    new Request('https://fixture.invalid'),
    'workspace',
    'event',
    {
      authorize,
      resolveSource,
      resolveConnection,
    } as unknown as Parameters<typeof createRequestColorOperationAccess>[3],
    { operationId: () => operationId }
  );
  return {
    rows,
    predicates,
    authorize,
    resolveSource,
    resolveConnection,
    sbAdmin,
    access,
  };
}

describe('request-bound color operation access', () => {
  it('reauthorizes every invocation and builds SDK auth from the verified token row', async () => {
    const f = fixture();
    const discovered = await f.access.discover();
    await f.access.assertAllowed(discovered.identity);
    await f.access.provider(discovered.identity);
    expect(f.authorize).toHaveBeenCalledTimes(3);
    expect(m.credentials).toHaveBeenLastCalledWith({
      access_token: 'verified-fixture',
      refresh_token: undefined,
    });
  });
  it('scopes every privileged event, connection and token read to the actor workspace', async () => {
    const f = fixture();
    await f.access.discover();
    expect(f.predicates.workspace_calendar_events).toEqual([
      ['ws_id', 'workspace'],
      ['id', 'event'],
    ]);
    expect(f.predicates.calendar_connections).toEqual([
      ['id', 'connection'],
      ['ws_id', 'workspace'],
      ['provider', 'google'],
      ['calendar_id', 'calendar'],
      ['is_enabled', true],
    ]);
    expect(f.predicates.calendar_auth_tokens).toEqual([
      ['id', 'token'],
      ['ws_id', 'workspace'],
      ['user_id', 'actor'],
      ['provider', 'google'],
      ['is_active', true],
    ]);
  });
  it('refuses recovery after linkage changes', async () => {
    const f = fixture();
    const { identity } = await f.access.discover();
    f.rows.workspace_calendar_events = {
      provider: 'google',
      external_event_id: 'another-provider-event',
    };
    await expect(f.access.provider(identity)).rejects.toMatchObject({
      reason: 'identity',
    });
  });
  it('refuses recovery after account access disappears', async () => {
    const f = fixture();
    const { identity } = await f.access.discover();
    f.rows.calendar_auth_tokens = null;
    await expect(f.access.provider(identity)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
  });
  it('refuses actor changes between discovery and execution', async () => {
    const f = fixture();
    const { identity } = await f.access.discover();
    f.authorize.mockResolvedValue({
      wsId: 'workspace',
      userId: 'other',
      sbAdmin: {
        from: () => {
          throw new Error('must not read');
        },
      },
    } as never);
    await expect(f.access.assertAllowed(identity)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
  });
});

const deletionIdentity = {
  wsId: '22222222-2222-4222-8222-222222222222',
  eventId: '33333333-3333-4333-8333-333333333333',
  connectionId: '44444444-4444-4444-8444-444444444444',
  authTokenId: '55555555-5555-4555-8555-555555555555',
  calendarId: 'calendar',
  providerEventId: 'provider-event',
};
const deletionOperation = '11111111-1111-4111-8111-111111111111';
function deletionFixture() {
  const f = fixture(deletionOperation);
  f.rows.workspace_calendar_events = null;
  f.authorize.mockResolvedValue({
    wsId: deletionIdentity.wsId,
    userId: 'actor',
    sbAdmin: f.sbAdmin,
  });
  f.resolveConnection.mockResolvedValue({
    provider: 'google',
    connectionId: deletionIdentity.connectionId,
    externalCalendarId: 'calendar',
    accessToken: 'verified-fixture',
    refreshToken: null,
    workspaceCalendarId: null,
    label: 'calendar',
    color: null,
    accessRole: 'writer',
    accountEmail: null,
    accountName: null,
  });
  f.rows.calendar_connections = { auth_token_id: deletionIdentity.authTokenId };
  f.rows.calendar_auth_tokens = {
    id: deletionIdentity.authTokenId,
    access_token: 'verified-fixture',
    refresh_token: null,
  };
  f.sbAdmin.rpc.mockResolvedValue({
    data: {
      id: deletionOperation,
      phase: 'applied',
      identity: deletionIdentity,
    },
    error: null,
  });
  return f;
}
describe('confirmed deletion recovery access', () => {
  it('recovers the exact server-bound connection after local deletion while reauthorizing the actor', async () => {
    const f = deletionFixture();
    const access = createRequestColorOperationAccess(
      new Request('https://fixture.invalid'),
      deletionIdentity.wsId,
      deletionIdentity.eventId,
      {
        authorize: f.authorize,
        resolveSource: f.resolveSource,
        resolveConnection: f.resolveConnection,
      } as unknown as Parameters<typeof createRequestColorOperationAccess>[3],
      { operationId: () => deletionOperation }
    );
    const found = await access.discover();
    await access.assertAllowed(found.identity);
    expect(found.identity).toEqual(deletionIdentity);
    expect(f.resolveSource).not.toHaveBeenCalled();
    expect(f.resolveConnection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: {
          provider: 'google',
          connectionId: deletionIdentity.connectionId,
        },
      })
    );
    expect(f.authorize).toHaveBeenCalledTimes(2);
  });
  it('rejects non-terminal, wrong-operation, and revoked-source recovery without producing credentials', async () => {
    const f = deletionFixture();
    const access = createRequestColorOperationAccess(
      new Request('https://fixture.invalid'),
      deletionIdentity.wsId,
      deletionIdentity.eventId,
      {
        authorize: f.authorize,
        resolveSource: f.resolveSource,
        resolveConnection: f.resolveConnection,
      } as unknown as Parameters<typeof createRequestColorOperationAccess>[3],
      { operationId: () => deletionOperation }
    );
    f.sbAdmin.rpc.mockResolvedValueOnce({
      data: {
        id: deletionOperation,
        phase: 'dispatched',
        identity: deletionIdentity,
      },
      error: null,
    });
    await expect(access.discover()).rejects.toMatchObject({
      reason: 'identity',
    });
    f.sbAdmin.rpc.mockResolvedValueOnce({
      data: {
        id: '77777777-7777-4777-8777-777777777777',
        phase: 'applied',
        identity: deletionIdentity,
      },
      error: null,
    });
    await expect(access.discover()).rejects.toMatchObject({
      reason: 'identity',
    });
    f.rows.calendar_auth_tokens = null;
    await expect(access.provider(deletionIdentity)).rejects.toMatchObject({
      reason: 'unauthorized',
    });
    expect(m.credentials).not.toHaveBeenCalled();
  });
});
