import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fullSyncMock,
  getTokenMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  fullSyncMock: vi.fn(),
  getTokenMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function OAuth2Client(this: {
    getToken: typeof getTokenMock;
    setCredentials: (tokens: unknown) => void;
  }) {
    this.getToken = getTokenMock;
    this.setCredentials = vi.fn();
  }),
  google: {
    calendar: vi.fn(() => ({
      calendarList: {
        list: vi.fn(async () => ({ data: { items: [] } })),
      },
    })),
    oauth2: vi.fn(() => ({
      userinfo: {
        get: vi.fn(async () => ({
          data: {
            email: 'person@example.com',
            name: 'Person Example',
          },
        })),
      },
    })),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@tuturuuu/trigger/google-calendar-full-sync', () => ({
  performFullSyncForWorkspace: fullSyncMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

import { createCalendarOAuthState } from '@/lib/calendar/calendar-oauth-state';
import { GET } from './route';

function signedState({
  secret = 'google-client-secret',
  userId = 'user-1',
  wsId = 'workspace-1',
  now,
}: {
  secret?: string;
  userId?: string;
  wsId?: string;
  now?: number;
} = {}) {
  return encodeURIComponent(
    createCalendarOAuthState('google', { userId, wsId }, secret, now)
  );
}

function callbackRequest(state: string, origin = 'https://tuturuuu.com') {
  return new Request(
    `${origin}/api/v1/calendar/auth/callback?code=abc&state=${state}`
  );
}

interface ExistingCalendarToken {
  id: string;
  refresh_token: string | null;
}

function createTokenResponse(refreshToken: string | null = 'refresh-token') {
  return {
    tokens: {
      access_token: 'access-token',
      expiry_date: Date.now() + 3600_000,
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      token_type: 'Bearer',
    },
  };
}

function createSupabaseClient({
  existingToken = null,
}: {
  existingToken?: ExistingCalendarToken | null;
} = {}) {
  const calendarConnectionsUpsertMock = vi.fn(async () => ({ error: null }));
  const tokenInsertMock = vi.fn(async () => ({ error: null }));
  const tokenUpdateEqMock = vi.fn(async () => ({ error: null }));
  const tokenUpdateMock = vi.fn(() => ({
    eq: tokenUpdateEqMock,
  }));

  const client = {
    from: vi.fn((table: string) => {
      if (table === 'calendar_auth_tokens') {
        let selection = '';
        const query = {
          eq: () => query,
          insert: tokenInsertMock,
          is: () => query,
          select: (nextSelection: string) => {
            selection = nextSelection;
            return query;
          },
          single: vi.fn(async () => {
            if (selection === 'id') {
              return {
                data: { id: existingToken?.id ?? 'token-id' },
                error: null,
              };
            }

            if (existingToken) {
              return { data: existingToken, error: null };
            }

            return {
              data: null,
              error: { code: 'PGRST116', message: 'No rows found' },
            };
          }),
          update: tokenUpdateMock,
        };

        return query;
      }

      if (table === 'calendar_connections') {
        return {
          upsert: calendarConnectionsUpsertMock,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    calendarConnectionsUpsertMock,
    client,
    tokenInsertMock,
    tokenUpdateEqMock,
    tokenUpdateMock,
  };
}

function mockResolvedAuthContext(client: unknown) {
  resolveSessionAuthContextMock.mockResolvedValue({
    ok: true,
    supabase: client,
    user: { id: 'user-1' },
  });
}

describe('Google Calendar OAuth callback route', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-client-secret');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getTokenMock.mockResolvedValue(createTokenResponse());
    mockResolvedAuthContext(createSupabaseClient().client);
    fullSyncMock.mockResolvedValue([]);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const)(
    'fails closed when %s is missing',
    async (environmentVariable) => {
      vi.stubEnv(environmentVariable, '');

      const response = await GET(
        callbackRequest(signedState(), 'https://calendar.tuturuuu.com')
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        code: 'google_calendar_not_configured',
        error: 'Google Calendar integration is not configured',
      });
      expect(getTokenMock).not.toHaveBeenCalled();
      expect(fullSyncMock).not.toHaveBeenCalled();
    }
  );

  it('redirects wildcard listener callbacks back to the public Web origin', async () => {
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    const response = await GET(
      callbackRequest(signedState(), 'http://0.0.0.0:7803')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/workspace-1/calendar?provider=google&connected=true'
    );
  });

  it('preserves an existing refresh token when Google omits one on reconnect', async () => {
    getTokenMock.mockResolvedValue(createTokenResponse(null));
    const supabase = createSupabaseClient({
      existingToken: {
        id: 'existing-token-id',
        refresh_token: 'stored-refresh-token',
      },
    });
    mockResolvedAuthContext(supabase.client);

    const response = await GET(callbackRequest(signedState()));

    expect(response.status).toBe(302);
    expect(supabase.tokenUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: 'access-token',
        is_active: true,
        refresh_token: 'stored-refresh-token',
      })
    );
    expect(supabase.tokenInsertMock).not.toHaveBeenCalled();
    expect(fullSyncMock).toHaveBeenCalledWith(
      'primary',
      'workspace-1',
      'access-token',
      'stored-refresh-token'
    );
  });

  it('does not save an active Google connection without any refresh token', async () => {
    getTokenMock.mockResolvedValue(createTokenResponse(null));
    const supabase = createSupabaseClient();
    mockResolvedAuthContext(supabase.client);

    const response = await GET(callbackRequest(signedState()));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('No refresh token received');
    expect(supabase.tokenUpdateMock).not.toHaveBeenCalled();
    expect(supabase.tokenInsertMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an unsigned workspace id', () => 'workspace-1'],
    ['a state signed with another key', () => signedState({ secret: 'x' })],
    [
      'an expired state',
      () => signedState({ now: Date.now() - 11 * 60 * 1000 }),
    ],
    [
      'a state with a swapped workspace',
      () => {
        const [content, signature] = decodeURIComponent(signedState()).split(
          '.'
        );
        const payload = JSON.parse(
          Buffer.from(content!, 'base64url').toString('utf8')
        ) as Record<string, unknown>;
        const swapped = Buffer.from(
          JSON.stringify({ ...payload, ws: 'workspace-2' })
        ).toString('base64url');
        return encodeURIComponent(`${swapped}.${signature}`);
      },
    ],
  ])('rejects %s before exchanging the code', async (_label, buildState) => {
    const response = await GET(callbackRequest(buildState()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid OAuth state',
    });
    expect(resolveSessionAuthContextMock).not.toHaveBeenCalled();
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
  });

  it('rejects a state issued to a different signed-in user', async () => {
    const response = await GET(
      callbackRequest(signedState({ userId: 'user-2' }))
    );

    expect(response.status).toBe(403);
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callbacks before exchanging the code', async () => {
    resolveSessionAuthContextMock.mockResolvedValue({ ok: false });

    const response = await GET(callbackRequest(signedState()));

    expect(response.status).toBe(401);
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
  });

  it('rejects callbacks for a workspace the user is not a member of', async () => {
    const supabase = createSupabaseClient();
    mockResolvedAuthContext(supabase.client);
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });

    const response = await GET(callbackRequest(signedState()));

    expect(response.status).toBe(403);
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', wsId: 'workspace-1' })
    );
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(supabase.tokenInsertMock).not.toHaveBeenCalled();
    expect(supabase.calendarConnectionsUpsertMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
  });
});
