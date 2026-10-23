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

import {
  createCalendarOAuthState,
  deriveCalendarOAuthPkce,
} from '@/lib/calendar/calendar-oauth-state';
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
    createCalendarOAuthState('google', { userId, wsId }, secret, now).state
  );
}

function callbackRequest(
  state: string,
  origin = 'https://tuturuuu.com',
  headers?: HeadersInit
) {
  return new Request(
    `${origin}/api/v1/calendar/auth/callback?code=abc&state=${state}`,
    { headers }
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
    for (const key of [
      'WEB_APP_URL',
      'NEXT_PUBLIC_WEB_APP_URL',
      'NEXT_PUBLIC_APP_URL',
      'COOLIFY_URL',
      'COOLIFY_FQDN',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
      'NEXT_PUBLIC_CALENDAR_APP_URL',
    ]) {
      vi.stubEnv(key, '');
    }
    vi.stubEnv('CALENDAR_APP_URL', 'https://calendar.tuturuuu.com');
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

  it('redirects wildcard listener callbacks to the Calendar workspace page', async () => {
    vi.stubEnv('GOOGLE_REDIRECT_URI', '');

    const response = await GET(
      callbackRequest(signedState(), 'http://0.0.0.0:7803')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/workspace-1?provider=google&connected=true'
    );
  });

  it.each([
    [
      'the single-use state store',
      { CALENDAR_APP_URL: 'https://calendar.tuturuuu.com' },
    ],
    [
      'a Calendar public origin',
      {
        CALENDAR_APP_URL: '',
        UPSTASH_REDIS_REST_TOKEN: 'token',
        UPSTASH_REDIS_REST_URL: 'https://store.example',
      },
    ],
  ])('fails closed in production without %s', async (_label, env) => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);

    const response = await GET(callbackRequest(signedState()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Calendar connection is temporarily unavailable',
    });
    expect(resolveSessionAuthContextMock).not.toHaveBeenCalled();
    expect(getTokenMock).not.toHaveBeenCalled();
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

  it('redirects to the configured Calendar origin regardless of request host headers', async () => {
    const response = await GET(
      callbackRequest(signedState(), 'https://attacker.example', {
        host: 'attacker.example',
        'x-forwarded-host': 'attacker.example',
        'x-forwarded-proto': 'https',
      })
    );
    const location = new URL(response.headers.get('location') ?? '');

    expect(response.status).toBe(302);
    expect(location.origin).toBe('https://calendar.tuturuuu.com');
    expect(location.pathname).toBe('/workspace-1');
  });

  it('exchanges the code with the PKCE verifier bound to the state', async () => {
    const created = createCalendarOAuthState(
      'google',
      { userId: 'user-1', wsId: 'workspace-1' },
      'google-client-secret'
    );

    await GET(callbackRequest(encodeURIComponent(created.state)));

    expect(getTokenMock).toHaveBeenCalledWith({
      code: 'abc',
      codeVerifier: deriveCalendarOAuthPkce(
        'google',
        created.nonce,
        'google-client-secret'
      ).codeVerifier,
    });
  });

  it('rejects a replayed state even with a fresh code', async () => {
    const state = signedState();

    const first = await GET(callbackRequest(state));
    const replay = await GET(
      new Request(
        `https://tuturuuu.com/api/v1/calendar/auth/callback?code=fresh&state=${state}`
      )
    );

    expect(first.status).toBe(302);
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toEqual({
      error: 'Invalid OAuth state',
    });
    expect(getTokenMock).toHaveBeenCalledTimes(1);
    expect(fullSyncMock).toHaveBeenCalledTimes(1);
  });
});
