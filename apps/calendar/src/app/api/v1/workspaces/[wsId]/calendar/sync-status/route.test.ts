import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readError: vi.fn(),
  auth: vi.fn(),
  admin: vi.fn(),
  membership: vi.fn(),
  inactiveConnectionEnabled: vi.fn(),
  connections: [
    {
      id: 'active',
      is_enabled: true,
      sync_inbound_enabled: true,
      auth_token_id: 'account',
    },
    {
      id: 'paused',
      is_enabled: true,
      sync_inbound_enabled: false,
      auth_token_id: 'account',
    },
    {
      id: 'shared',
      is_enabled: true,
      sync_inbound_enabled: true,
      auth_token_id: 'other-account',
    },
  ],
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { GET } from './route';

const wsId = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.readError.mockReturnValue(null);
  mocks.inactiveConnectionEnabled.mockReturnValue(false);
  const failedCalendars = ['active', 'paused'].map((connectionId) => ({
    connectionId,
    calendarName: connectionId,
    code: 'not_found',
    privatePayload: 'hidden',
  }));
  const data: Record<string, Record<string, unknown>[]> = {
    calendar_auth_tokens: [
      { id: 'account', provider: 'google', user_id: 'user', is_active: true },
      {
        id: 'other-account',
        provider: 'google',
        user_id: 'other-member',
        account_email: 'other-member@example.test',
        is_active: true,
      },
      {
        id: 'inactive-account',
        provider: 'google',
        user_id: 'user',
        is_active: false,
      },
    ],
    calendar_sync_dashboard: [
      {
        ws_id: wsId,
        status: 'failed',
        start_time: new Date().toISOString(),
        error_message:
          'Provider rejected access_token=example-sensitive-fixture',
        error_type: 'not_found',
        error_stack_trace: JSON.stringify({ version: 1, failedCalendars }),
      },
      { ws_id: 'another-workspace', status: 'running' },
    ],
  };
  function from(table: string, admin: boolean) {
    let accountOwner: string | undefined;
    let historyScope: string | undefined;
    const query = Object.assign(
      Promise.resolve().then(() => ({
        data:
          table === 'calendar_connections'
            ? [
                ...mocks.connections,
                {
                  id: 'owned-inactive',
                  is_enabled: mocks.inactiveConnectionEnabled(),
                  sync_inbound_enabled: true,
                  auth_token_id: 'inactive-account',
                },
              ]
            : data[table]
                ?.filter((row) =>
                  table === 'calendar_sync_dashboard'
                    ? row.ws_id === historyScope
                    : !accountOwner || row.user_id === accountOwner
                )
                .map(({ ws_id: _, ...row }) => row),
        error:
          table === 'calendar_sync_dashboard' && !admin
            ? { code: '42501' }
            : mocks.readError(table),
      })),
      {
        select: () => query,
        eq: (column: string, value: string) => {
          if (column === 'user_id') accountOwner = value;
          if (column === 'ws_id') historyScope = value;
          return query;
        },
        order: () => query,
        limit: () => query,
      }
    );
    return query;
  }
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'user' },
    supabase: { from: (table: string) => from(table, false) },
  });
  mocks.admin.mockResolvedValue({ from: (table: string) => from(table, true) });
});
describe('calendar sync recovery status', () => {
  it('reads authorized workspace history through the server client and strips private diagnostics', async () => {
    const response = await GET(new Request('https://calendar.test') as never, {
      params: Promise.resolve({ wsId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.failedCalendars).toEqual([
      { connectionId: 'active', calendarName: 'active', code: 'not_found' },
    ]);
    expect(body.recentRuns[0]).not.toHaveProperty('error_stack_trace');
    expect(body.recentRuns).toHaveLength(1);
    expect(body.recentRuns[0].error_message).toContain('[redacted]');
    expect(JSON.stringify(body)).not.toContain('privatePayload');
    expect(mocks.admin).toHaveBeenCalledExactlyOnceWith({ noCookie: true });
    expect(body.unavailable).toEqual([]);
  });
  it('preserves account and connection status when history fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.readError.mockImplementation((table) =>
        table === 'calendar_sync_dashboard'
          ? { code: '42501', message: 'private database detail' }
          : null
      );
      const response = await GET(
        new Request('https://calendar.test') as never,
        {
          params: Promise.resolve({ wsId }),
        }
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        health: { state: 'degraded', reason: 'status_unavailable' },
        unavailable: ['dashboard'],
        accounts: [{ id: 'account' }],
        connectionsSummary: { total: 4, enabled: 3 },
        failedCalendars: [],
        recentRuns: [],
      });
      expect(JSON.stringify(body)).not.toContain('private database detail');
      expect(log).toHaveBeenCalledWith('Calendar sync status reads failed', {
        failedReads: [{ source: 'dashboard', code: '42501' }],
      });
    } finally {
      log.mockRestore();
    }
  });
  it.each([
    ['calendar_auth_tokens', 'accounts'],
    ['calendar_connections', 'connections'],
  ])('preserves history if %s fails', async (table, unavailable) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.readError.mockImplementation((name) =>
        name === table ? { code: '42501' } : null
      );
      const response = await GET(
        new Request('https://calendar.test') as never,
        {
          params: Promise.resolve({ wsId }),
        }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        health: { state: 'degraded', reason: 'status_unavailable' },
        unavailable: [unavailable],
        recentRuns: [{ status: 'failed' }],
      });
    } finally {
      log.mockRestore();
    }
  });
  it('returns 500 when no status section can be loaded', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.readError.mockReturnValue({ code: '42501' });
      const response = await GET(
        new Request('https://calendar.test') as never,
        {
          params: Promise.resolve({ wsId }),
        }
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to load sync status',
      });
    } finally {
      log.mockRestore();
    }
  });
  it('omits another member’s provider accounts without treating their calendar as disconnected', async () => {
    const response = await GET(new Request('https://calendar.test') as never, {
      params: Promise.resolve({ wsId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.accounts).toMatchObject([{ id: 'account' }]);
    expect(body.accountsSummary).toEqual({ total: 1, google: 1, microsoft: 0 });
    expect(body.health.reason).toBe('not_found');
  });
  it('reports a reconnect when an enabled calendar belongs to the member’s inactive account', async () => {
    mocks.inactiveConnectionEnabled.mockReturnValue(true);
    const response = await GET(new Request('https://calendar.test') as never, {
      params: Promise.resolve({ wsId }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).health.reason).toBe('reconnect_required');
  });
  it('does not reveal sync details without workspace membership', async () => {
    mocks.membership.mockResolvedValue({ ok: false });
    const response = await GET(new Request('https://calendar.test') as never, {
      params: Promise.resolve({ wsId }),
    });
    expect(response.status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
