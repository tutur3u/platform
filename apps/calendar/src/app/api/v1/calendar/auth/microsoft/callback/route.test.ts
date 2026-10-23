import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  acquireTokenByCodeMock,
  cookieGetMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  acquireTokenByCodeMock: vi.fn(),
  cookieGetMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/microsoft', () => ({
  ConfidentialClientApplication: vi.fn(
    function ConfidentialClientApplication(this: {
      acquireTokenByCode: typeof acquireTokenByCodeMock;
      getTokenCache: () => { serialize: () => string };
    }) {
      this.acquireTokenByCode = acquireTokenByCodeMock;
      this.getTokenCache = () => ({ serialize: () => '{}' });
    }
  ),
  createGraphClient: vi.fn(() => ({
    api: () => ({
      get: async () => ({ displayName: 'Person', mail: 'person@example.com' }),
    }),
  })),
  createMsalConfig: vi.fn(() => ({})),
  MICROSOFT_CALENDAR_SCOPES: ['Calendars.ReadWrite'],
}));

vi.mock('@tuturuuu/microsoft/calendar', () => ({
  fetchMicrosoftCalendars: vi.fn(async () => []),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock })),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

vi.mock('@/lib/calendar/microsoft-refresh-credential', () => ({
  microsoftRefreshCredential: vi.fn(() => 'refresh-credential'),
}));

import { createCalendarOAuthState } from '@/lib/calendar/calendar-oauth-state';
import { GET } from './route';

const SECRET = 'microsoft-client-secret';
const CALENDAR_ORIGIN = 'https://calendar.tuturuuu.com';
const ATTACKER_HEADERS = {
  host: 'attacker.example',
  'x-forwarded-host': 'attacker.example',
  'x-forwarded-proto': 'https',
};

function signedState({
  provider = 'microsoft' as const,
  userId = 'user-1',
  wsId = 'workspace-1',
}: {
  provider?: 'google' | 'microsoft';
  userId?: string;
  wsId?: string;
} = {}) {
  return encodeURIComponent(
    createCalendarOAuthState(provider, { userId, wsId }, SECRET).state
  );
}

function callback(
  query: string,
  {
    headers,
    origin = 'https://tuturuuu.com',
  }: {
    headers?: HeadersInit;
    origin?: string;
  } = {}
) {
  return new Request(
    `${origin}/api/v1/calendar/auth/microsoft/callback?${query}`,
    { headers }
  );
}

function createSupabaseClient() {
  const query = {
    eq: () => query,
    insert: vi.fn(async () => ({ error: null })),
    select: () => query,
    single: vi.fn(async () => ({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    })),
    upsert: vi.fn(async () => ({ error: null })),
  };

  return { from: vi.fn(() => query), query };
}

function locationOf(response: Response) {
  return new URL(response.headers.get('location') ?? '');
}

describe('Microsoft Calendar OAuth callback route', () => {
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
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'microsoft-client-id');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', SECRET);
    vi.stubEnv(
      'MICROSOFT_REDIRECT_URI',
      'https://tuturuuu.com/api/v1/calendar/auth/microsoft/callback'
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cookieGetMock.mockReturnValue({ value: 'pkce-verifier' });
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: createSupabaseClient(),
      user: { id: 'user-1' },
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    acquireTokenByCodeMock.mockResolvedValue({
      accessToken: 'access-token',
      account: { homeAccountId: 'home-account', username: 'person' },
      expiresOn: new Date(Date.now() + 3600_000),
    });
  });

  it.each([
    ['a protocol-relative host', '//evil.example'],
    ['an absolute path', '/evil.example'],
    [
      'a state signed for another provider',
      decodeURIComponent(signedState({ provider: 'google' })),
    ],
  ])(
    'keeps provider error redirects on the app origin for %s',
    async (_label, state) => {
      const response = await GET(
        callback(`error=access_denied&state=${encodeURIComponent(state)}`)
      );

      expect(response.status).toBe(302);
      expect(locationOf(response).origin).toBe(CALENDAR_ORIGIN);
      expect(locationOf(response).pathname).toBe('/');
    }
  );

  it('returns provider errors to the signed workspace calendar', async () => {
    const response = await GET(
      callback(`error=access_denied&state=${signedState()}`)
    );

    expect(locationOf(response).origin).toBe(CALENDAR_ORIGIN);
    expect(locationOf(response).pathname).toBe('/workspace-1');
  });

  it.each([
    ['provider error', () => `error=access_denied&state=${signedState()}`],
    ['successful connection', () => `code=abc&state=${signedState()}`],
  ])(
    'ignores attacker request hosts for the %s redirect',
    async (_label, query) => {
      const response = await GET(
        callback(query(), {
          headers: ATTACKER_HEADERS,
          origin: 'https://attacker.example',
        })
      );

      expect(response.status).toBe(302);
      expect(locationOf(response).origin).toBe(CALENDAR_ORIGIN);
      expect(locationOf(response).pathname).toBe('/workspace-1');
    }
  );

  it('ignores attacker request hosts when the PKCE cookie is missing', async () => {
    cookieGetMock.mockReturnValue(undefined);

    const response = await GET(
      callback(`code=abc&state=${signedState()}`, {
        headers: ATTACKER_HEADERS,
        origin: 'https://attacker.example',
      })
    );

    expect(locationOf(response).origin).toBe(CALENDAR_ORIGIN);
    expect(acquireTokenByCodeMock).not.toHaveBeenCalled();
  });

  it.each([
    ['provider error', () => `error=access_denied&state=${signedState()}`],
    ['code', () => `code=abc&state=${signedState()}`],
  ])(
    'fails closed in production without the state store for a %s callback',
    async (_label, query) => {
      vi.stubEnv('NODE_ENV', 'production');

      const response = await GET(callback(query()));

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: 'Calendar connection is temporarily unavailable',
      });
      expect(resolveSessionAuthContextMock).not.toHaveBeenCalled();
      expect(acquireTokenByCodeMock).not.toHaveBeenCalled();
    }
  );

  it('rejects an unsigned workspace state before exchanging the code', async () => {
    const response = await GET(callback('code=abc&state=workspace-1'));

    expect(response.status).toBe(400);
    expect(resolveSessionAuthContextMock).not.toHaveBeenCalled();
    expect(acquireTokenByCodeMock).not.toHaveBeenCalled();
  });

  it('rejects a state issued to a different signed-in user', async () => {
    const response = await GET(
      callback(`code=abc&state=${signedState({ userId: 'user-2' })}`)
    );

    expect(response.status).toBe(403);
    expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
    expect(acquireTokenByCodeMock).not.toHaveBeenCalled();
  });

  it('rejects callbacks for a workspace the user is not a member of', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });

    const response = await GET(callback(`code=abc&state=${signedState()}`));

    expect(response.status).toBe(403);
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', wsId: 'workspace-1' })
    );
    expect(acquireTokenByCodeMock).not.toHaveBeenCalled();
  });

  it('exchanges the code with the PKCE verifier and rejects a replayed state', async () => {
    const state = signedState();

    const first = await GET(callback(`code=abc&state=${state}`));
    const replay = await GET(callback(`code=fresh&state=${state}`));

    expect(first.status).toBe(302);
    expect(acquireTokenByCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'abc', codeVerifier: 'pkce-verifier' })
    );
    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toEqual({
      error: 'Invalid OAuth state',
    });
    expect(acquireTokenByCodeMock).toHaveBeenCalledTimes(1);
  });
});
