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
}));

import { createRequestColorOperationAccess } from './request-access';

function fixture() {
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
  const sbAdmin = {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
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
  const access = createRequestColorOperationAccess(
    new Request('https://fixture.invalid'),
    'workspace',
    'event',
    {
      authorize,
      resolveSource,
    } as unknown as Parameters<typeof createRequestColorOperationAccess>[3]
  );
  return { rows, authorize, resolveSource, access };
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
