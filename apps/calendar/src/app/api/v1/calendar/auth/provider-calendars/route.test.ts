import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    vi.clearAllMocks();
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

  it.each([
    ['invalid_grant', 'reconnect_required'],
    ['invalid_request', 'temporarily_unavailable'],
    ['rateLimitExceeded', 'temporarily_unavailable'],
  ])('maps provider error %s to %s', async (error, state) => {
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
      'account-1': { state },
    });
  });
});
