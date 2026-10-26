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
    generateAuthUrl: (input: Record<string, unknown>) => string;
  }) {
    this.getToken = getTokenMock;
    this.setCredentials = vi.fn();
    this.generateAuthUrl = (input) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(
        Object.entries(input).map(([key, value]) => [key, String(value)])
      )}`;
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

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale }: { locale: string }) => {
    const { createTranslator } = await import('use-intl/core');
    const messages =
      locale === 'vi'
        ? (await import('../../../../../../../messages/vi.json')).default
        : (await import('../../../../../../../messages/en.json')).default;
    return createTranslator({ locale, messages, namespace: 'calendar' });
  },
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@tuturuuu/trigger/google-calendar-full-sync', () => ({
  performFullSyncForWorkspace: fullSyncMock,
}));

vi.mock('@tuturuuu/supabase/next/server', async () => {
  const { sharedFakeCalendarOAuthNonceLedger } = await import(
    '@/lib/calendar/calendar-oauth-nonce-ledger.test-utils'
  );
  return {
    createAdminClient: vi.fn(
      async () => sharedFakeCalendarOAuthNonceLedger().client
    ),
  };
});

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

import { BASE_URL } from '@/constants/common';
import { sharedFakeCalendarOAuthNonceLedger } from '@/lib/calendar/calendar-oauth-nonce-ledger.test-utils';
import {
  createCalendarOAuthState,
  deriveCalendarOAuthPkce,
} from '@/lib/calendar/calendar-oauth-state';
import { GET } from './route';

const nonceLedger = sharedFakeCalendarOAuthNonceLedger();
const CALENDAR_ORIGIN = new URL(BASE_URL).origin;

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
  created_at?: string;
  is_active?: boolean;
  deactivated_reason?: string | null;
  deactivated_at?: string | null;
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
  updateMatches = true,
}: {
  existingToken?: ExistingCalendarToken | null;
  updateMatches?: boolean;
} = {}) {
  const calendarConnectionsUpsertMock = vi.fn(async () => ({ error: null }));
  const tokenInsertMock = vi.fn(async () => ({ error: null }));
  // The update chain records its filters; `updateMatches: false` simulates
  // a guarded write that lost to a concurrent quarantine.
  const tokenUpdateFilters: Array<[string, unknown]> = [];
  const tokenUpdateChain = {
    eq: vi.fn((column: string, value: unknown) => {
      tokenUpdateFilters.push([column, value]);
      return tokenUpdateChain;
    }),
    is: vi.fn((column: string, value: unknown) => {
      tokenUpdateFilters.push([`is.${column}`, value]);
      return tokenUpdateChain;
    }),
    select: vi.fn(async () => ({
      data: updateMatches ? [{ id: existingToken?.id ?? 'token-id' }] : [],
      error: null,
    })),
  };
  const tokenUpdateEqMock = tokenUpdateChain.eq;
  const tokenUpdateMock = vi.fn(() => tokenUpdateChain);

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
    tokenUpdateFilters,
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
    ]) {
      vi.stubEnv(key, '');
    }
    nonceLedger.reset();
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
      `${CALENDAR_ORIGIN}/workspace-1?provider=google&connected=true`
    );
  });

  it('works in production with no Calendar, Web or Upstash env vars and ignores attacker hosts', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    for (const key of [
      'CALENDAR_APP_URL',
      'NEXT_PUBLIC_CALENDAR_APP_URL',
      'BASE_URL',
      'GOOGLE_REDIRECT_URI',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ]) {
      vi.stubEnv(key, '');
    }
    const { GET: productionGET } = await import('./route');
    const { OAuth2Client } = await import('@tuturuuu/google');

    const response = await productionGET(
      callbackRequest(signedState(), 'https://attacker.example', {
        host: 'attacker.example',
        'x-forwarded-host': 'attacker.example',
        'x-forwarded-proto': 'https',
      })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://calendar.tuturuuu.com/workspace-1?provider=google&connected=true'
    );
    expect(vi.mocked(OAuth2Client)).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri:
          'https://calendar.tuturuuu.com/api/v1/calendar/auth/callback',
      })
    );
    expect(nonceLedger.calls).toHaveLength(1);
  });

  it('fails closed before the code exchange when the nonce ledger is unavailable', async () => {
    nonceLedger.failure = {
      code: 'PGRST202',
      message: 'Could not find the function',
    };

    const response = await GET(callbackRequest(signedState()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Calendar connection is temporarily unavailable',
    });
    expect(getTokenMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
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

  it('reactivates a quarantined account and clears its reason in the same update', async () => {
    getTokenMock.mockResolvedValue(createTokenResponse('fresh-refresh-token'));
    const supabase = createSupabaseClient({
      existingToken: {
        id: 'existing-token-id',
        refresh_token: 'rejected-refresh-token',
        is_active: false,
        deactivated_reason: 'google_invalid_grant',
        deactivated_at: '2026-10-26T03:00:00Z',
      },
    });
    mockResolvedAuthContext(supabase.client);

    const response = await GET(callbackRequest(signedState()));

    expect(response.status).toBe(302);
    expect(supabase.tokenUpdateMock).toHaveBeenCalledTimes(1);
    expect(supabase.tokenUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_token: 'fresh-refresh-token',
        is_active: true,
        deactivated_reason: null,
        deactivated_at: null,
        created_at: expect.any(String),
      })
    );
    expect(supabase.tokenInsertMock).not.toHaveBeenCalled();
  });

  it('keeps a quarantined account and asks again with consent when Google omits the refresh token', async () => {
    getTokenMock.mockResolvedValue(createTokenResponse(null));
    const supabase = createSupabaseClient({
      existingToken: {
        id: 'existing-token-id',
        refresh_token: 'rejected-refresh-token',
        is_active: false,
        deactivated_reason: 'google_invalid_grant',
        deactivated_at: '2026-10-26T03:00:00Z',
      },
    });
    mockResolvedAuthContext(supabase.client);

    const response = await GET(callbackRequest(signedState()));
    const location = new URL(response.headers.get('location') ?? '');

    expect([302, 307]).toContain(response.status);
    expect(location.host).toBe('accounts.google.com');
    expect(location.searchParams.get('prompt')).toBe('consent');
    expect(location.searchParams.get('access_type')).toBe('offline');
    expect(supabase.tokenUpdateMock).not.toHaveBeenCalled();
    expect(supabase.tokenInsertMock).not.toHaveBeenCalled();
    expect(fullSyncMock).not.toHaveBeenCalled();
  });

  it('caps consent restarts across fresh OAuth flows and still accepts a fresh credential', async () => {
    getTokenMock.mockResolvedValue(createTokenResponse(null));
    const supabase = createSupabaseClient({
      existingToken: {
        id: 'existing-token-id',
        refresh_token: 'rejected-refresh-token',
        is_active: false,
        deactivated_reason: 'google_invalid_grant',
      },
    });
    mockResolvedAuthContext(supabase.client);
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 26, 8, 1));
    const first = await GET(callbackRequest(signedState()));
    expect(new URL(first.headers.get('location') ?? '').host).toBe(
      'accounts.google.com'
    );
    const repeated = await GET(
      callbackRequest(signedState(), 'https://calendar.tuturuuu.com', {
        'Accept-Language': 'vi',
      })
    );
    expect(repeated.status).toBe(429);
    expect(repeated.headers.get('Retry-After')).toBe('540');
    expect(repeated.headers.get('Cache-Control')).toBe('no-store');
    expect(repeated.headers.has('location')).toBe(false);
    expect(await repeated.json()).toEqual({
      code: 'google_calendar_consent_restart_limited',
      error:
        'Google chưa cấp mã làm mới. Vui lòng chờ trước khi kết nối lại tài khoản này.',
    });
    expect(supabase.tokenUpdateMock).not.toHaveBeenCalled();
    getTokenMock.mockResolvedValue(createTokenResponse('fresh-refresh-token'));
    const recovered = await GET(callbackRequest(signedState()));
    expect(recovered.status).toBe(302);
    expect(supabase.tokenUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_token: 'fresh-refresh-token',
        deactivated_reason: null,
        is_active: true,
      })
    );
  });

  it('returns retryable503 without redirect or token write when restart consumption fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = createSupabaseClient({
      existingToken: {
        id: 'existing-token-id',
        refresh_token: 'rejected',
        is_active: false,
        deactivated_reason: 'google_invalid_grant',
      },
    });
    mockResolvedAuthContext(supabase.client);
    getTokenMock.mockImplementation(async () => {
      nonceLedger.failure = { code: 'PGRST202', message: 'unavailable' };
      return createTokenResponse(null);
    });
    const response = await GET(callbackRequest(signedState()));
    expect(response.status).toBe(503);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(response.headers.has('location')).toBe(false);
    expect(supabase.tokenUpdateMock).not.toHaveBeenCalled();
    expect(supabase.tokenInsertMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      code: 'google_calendar_consent_restart_unavailable',
    });
  });

  it('asks again with consent when sync rejected the reused token after the read', async () => {
    getTokenMock.mockResolvedValue(createTokenResponse(null));
    // The callback read an active row; sync quarantined it before the write.
    const supabase = createSupabaseClient({
      existingToken: {
        id: 'existing-token-id',
        refresh_token: 'stored-refresh-token',
        is_active: true,
        created_at: '2026-10-26T01:00:00Z',
      },
      updateMatches: false,
    });
    mockResolvedAuthContext(supabase.client);

    const response = await GET(callbackRequest(signedState()));
    const location = new URL(response.headers.get('location') ?? '');

    expect(location.host).toBe('accounts.google.com');
    expect(location.searchParams.get('prompt')).toBe('consent');
    expect(supabase.tokenUpdateFilters).toEqual(
      expect.arrayContaining([
        ['id', 'existing-token-id'],
        ['is_active', true],
        ['created_at', '2026-10-26T01:00:00Z'],
        ['is.deactivated_reason', null],
      ])
    );
    expect(fullSyncMock).not.toHaveBeenCalled();
  });

  it('reactivates a fresh credential without the reuse guard', async () => {
    getTokenMock.mockResolvedValue(createTokenResponse('fresh-refresh-token'));
    const supabase = createSupabaseClient({
      existingToken: {
        id: 'existing-token-id',
        refresh_token: 'stored-refresh-token',
        is_active: true,
        created_at: '2026-10-26T01:00:00Z',
      },
    });
    mockResolvedAuthContext(supabase.client);

    await GET(callbackRequest(signedState()));

    expect(supabase.tokenUpdateFilters).toEqual([['id', 'existing-token-id']]);
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
    expect(location.origin).toBe(CALENDAR_ORIGIN);
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
    expect(nonceLedger.calls).toHaveLength(2);
    expect(nonceLedger.calls[0]).toMatchObject({
      args: { p_provider: 'google', p_user_id: 'user-1' },
      fn: 'consume_calendar_oauth_state_nonce',
      schema: 'private',
    });
    expect(nonceLedger.calls[1]?.args.p_nonce).toBe(
      nonceLedger.calls[0]?.args.p_nonce
    );
  });
});
