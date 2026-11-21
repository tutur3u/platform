import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  googleCalendarMock,
  normalizeWorkspaceIdMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  googleCalendarMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: class {
    setCredentials = vi.fn();
  },
  google: {
    calendar: googleCalendarMock,
  },
}));

vi.mock('@tuturuuu/microsoft', () => ({
  createGraphClient: vi.fn(),
}));

vi.mock('@tuturuuu/microsoft/calendar', () => ({
  fetchMicrosoftCalendars: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: normalizeWorkspaceIdMock,
}));

import { GET } from './route';

function createTokenQuery() {
  const query = {
    data: [] as Array<Record<string, unknown>>,
    error: null,
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };

  return query;
}

describe('calendar provider calendars route', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
    normalizeWorkspaceIdMock.mockResolvedValue('workspace-1');
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
  });

  it('accepts calendar app-session auth and filters by account id', async () => {
    const tokenQuery = createTokenQuery();
    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'calendar_auth_tokens') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return tokenQuery;
      }),
    };
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: 'user-1' },
    });

    const response = await GET(
      new Request(
        'http://localhost/api/v1/calendar/auth/provider-calendars?wsId=personal&accountId=account-1'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.calendars).toEqual([]);
    expect(resolveSessionAuthContextMock).toHaveBeenCalledWith(
      expect.any(Request),
      {
        allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
      }
    );
    expect(normalizeWorkspaceIdMock).toHaveBeenCalledWith('personal', supabase);
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith({
      wsId: 'workspace-1',
      userId: 'user-1',
      supabase,
    });
    expect(tokenQuery.eq).toHaveBeenCalledWith('id', 'account-1');
  });

  it('rejects users without workspace access', async () => {
    const supabase = { from: vi.fn() };
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase,
      user: { id: 'user-1' },
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: false });

    const response = await GET(
      new Request(
        'http://localhost/api/v1/calendar/auth/provider-calendars?wsId=personal'
      )
    );

    expect(response.status).toBe(403);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('offers reconnection for an expired Google access token without a refresh credential', async () => {
    const tokenQuery = createTokenQuery();
    tokenQuery.data = [
      {
        id: 'expired',
        provider: 'google',
        access_token: 'expired',
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    ];
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: { from: () => tokenQuery },
      user: { id: 'user-1' },
    });
    const response = await GET(
      new Request(
        'http://localhost/api/v1/calendar/auth/provider-calendars?wsId=workspace-1'
      )
    );
    expect(await response.json()).toMatchObject({
      accountStatuses: { expired: { state: 'reconnect_required' } },
    });
    expect(googleCalendarMock).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_grant', { state: 'reconnect_required' }],
    [
      'invalid_request',
      { state: 'temporarily_unavailable', issue: 'configuration' },
    ],
    ['rateLimitExceeded', { state: 'temporarily_unavailable' }],
  ])(
    'maps provider error %s with a compatible retry state',
    async (error, status) => {
      const tokenQuery = createTokenQuery();
      tokenQuery.data = [
        {
          id: 'account-1',
          provider: 'google',
          access_token: 'expired',
          refresh_token: 'invalid',
          account_email: 'member@example.com',
          account_name: 'Member',
        },
      ];
      const supabase = { from: vi.fn(() => tokenQuery) };
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase,
        user: { id: 'user-1' },
      });
      googleCalendarMock.mockImplementation(() => {
        throw new Error(error);
      });

      const response = await GET(
        new Request(
          'http://localhost/api/v1/calendar/auth/provider-calendars?wsId=workspace-1'
        )
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.byAccount).toEqual({ 'account-1': [] });
      expect(body.accountStatuses).toEqual({
        'account-1': status,
      });
    }
  );

  it('correlates a failing account without logging identifiers, credentials or error payloads', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const tokenQuery = createTokenQuery();
      tokenQuery.data = ['failing-row', 'working-row'].map((id) => ({
        id,
        provider: 'google',
        account_email: 'member@example.test',
        access_token: 'fixture-access',
        refresh_token: 'fixture-refresh',
      }));
      resolveSessionAuthContextMock.mockResolvedValue({
        ok: true,
        supabase: { from: () => tokenQuery },
        user: { id: 'user-1' },
      });
      const upstreamFailure = Object.assign(
        new Error('private upstream text'),
        {
          name: 'GaxiosError',
          response: {
            status: 403,
            data: {
              error: { errors: [{ reason: 'insufficientPermissions' }] },
            },
          },
        }
      );
      googleCalendarMock
        .mockImplementationOnce(() => ({
          calendarList: { list: vi.fn().mockRejectedValue(upstreamFailure) },
        }))
        .mockImplementationOnce(() => ({
          calendarList: {
            list: vi
              .fn()
              .mockResolvedValue({ data: { items: [{ id: 'primary' }] } }),
          },
        }));

      const response = await GET(
        new Request(
          'http://localhost/api/v1/calendar/auth/provider-calendars?wsId=workspace-1'
        )
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        accountStatuses: {
          'failing-row': { state: 'scope_required' },
          'working-row': { state: 'connected' },
        },
      });
      const requestId = response.headers.get('x-calendar-request-id');
      expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(log).toHaveBeenCalledExactlyOnceWith(
        'Failed to fetch provider calendars',
        {
          requestId,
          accountHash: expect.stringMatching(/^[0-9a-f]{16}$/),
          upstreamStatus: 403,
          googleErrorCode: 'insufficientPermissions',
          errorName: 'GaxiosError',
          transportCategory: null,
        }
      );
    } finally {
      log.mockRestore();
    }
  });
});
