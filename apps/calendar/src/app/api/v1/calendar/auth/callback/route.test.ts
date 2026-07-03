import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fullSyncMock, getTokenMock, resolveSessionAuthContextMock } =
  vi.hoisted(() => ({
    fullSyncMock: vi.fn(),
    getTokenMock: vi.fn(),
    resolveSessionAuthContextMock: vi.fn(),
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

import { GET } from './route';

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
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    getTokenMock.mockResolvedValue(createTokenResponse());
    mockResolvedAuthContext(createSupabaseClient().client);
    fullSyncMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects wildcard listener callbacks back to the public Web origin', async () => {
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    const response = await GET(
      new Request(
        'http://0.0.0.0:7803/api/v1/calendar/auth/callback?code=abc&state=workspace-1'
      )
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

    const response = await GET(
      new Request(
        'https://tuturuuu.com/api/v1/calendar/auth/callback?code=abc&state=workspace-1'
      )
    );

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

    const response = await GET(
      new Request(
        'https://tuturuuu.com/api/v1/calendar/auth/callback?code=abc&state=workspace-1'
      )
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toBe('No refresh token received');
    expect(supabase.tokenUpdateMock).not.toHaveBeenCalled();
    expect(supabase.tokenInsertMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
  });
});
