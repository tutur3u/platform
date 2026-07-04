import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  normalizeWorkspaceIdMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  normalizeWorkspaceIdMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(),
  google: {
    calendar: vi.fn(),
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
    data: [],
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
        allowAppSessionAuth: { targetApp: 'calendar' },
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
});
