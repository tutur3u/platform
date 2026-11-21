import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readError: vi.fn(),
  auth: vi.fn(),
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
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { GET } from './route';

const wsId = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
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
        status: 'failed',
        start_time: new Date().toISOString(),
        error_type: 'not_found',
        error_stack_trace: JSON.stringify({ version: 1, failedCalendars }),
      },
    ],
  };
  mocks.auth.mockResolvedValue({
    ok: true,
    user: { id: 'user' },
    supabase: {
      from: (table: string) => {
        let accountOwner: string | undefined;
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
                : data[table]?.filter(
                    (row) => !accountOwner || row.user_id === accountOwner
                  ),
            error: mocks.readError(table),
          })),
          {
            select: () => query,
            eq: (column: string, value: string) => {
              if (column === 'user_id') accountOwner = value;
              return query;
            },
            order: () => query,
            limit: () => query,
          }
        );
        return query;
      },
    },
  });
});
describe('calendar sync recovery status', () => {
  it('exposes actionable failures and strips raw diagnostics and paused calendars', async () => {
    const response = await GET(new Request('https://calendar.test') as never, {
      params: Promise.resolve({ wsId }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.failedCalendars).toEqual([
      { connectionId: 'active', calendarName: 'active', code: 'not_found' },
    ]);
    expect(body.recentRuns[0]).not.toHaveProperty('error_stack_trace');
    expect(JSON.stringify(body)).not.toContain('privatePayload');
  });
  it('logs which status read failed without returning the database error', async () => {
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
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: 'Failed to load sync status',
      });
      expect(log).toHaveBeenCalledWith('Calendar sync status reads failed', {
        failedReads: [{ source: 'dashboard', code: '42501' }],
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
  });
});
