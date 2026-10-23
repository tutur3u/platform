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
    }) {
      this.acquireTokenByCode = acquireTokenByCodeMock;
    }
  ),
  createGraphClient: vi.fn(),
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

import { createCalendarOAuthState } from '@/lib/calendar/calendar-oauth-state';
import { GET } from './route';

const SECRET = 'microsoft-client-secret';

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
    createCalendarOAuthState(provider, { userId, wsId }, SECRET)
  );
}

function callback(query: string) {
  return new Request(
    `https://tuturuuu.com/api/v1/calendar/auth/microsoft/callback?${query}`
  );
}

describe('Microsoft Calendar OAuth callback route', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
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
      supabase: { from: vi.fn() },
      user: { id: 'user-1' },
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    acquireTokenByCodeMock.mockResolvedValue(null);
  });

  it.each([
    ['a protocol-relative host', '//evil.example'],
    ['an absolute path', '/evil.example'],
    [
      'a state signed for another provider',
      signedState({ provider: 'google' }),
    ],
  ])(
    'keeps provider error redirects on the app origin for %s',
    async (_label, state) => {
      const response = await GET(
        callback(`error=access_denied&state=${encodeURIComponent(state)}`)
      );
      const location = new URL(response.headers.get('location') ?? '');

      expect(response.status).toBe(302);
      expect(location.origin).toBe('https://tuturuuu.com');
      expect(location.pathname).toBe('/');
    }
  );

  it('returns provider errors to the signed workspace calendar', async () => {
    const response = await GET(
      callback(`error=access_denied&state=${signedState()}`)
    );
    const location = new URL(response.headers.get('location') ?? '');

    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/workspace-1/calendar');
  });

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

  it('exchanges the code once the state, user and membership are verified', async () => {
    const response = await GET(callback(`code=abc&state=${signedState()}`));

    expect(acquireTokenByCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'abc', codeVerifier: 'pkce-verifier' })
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'No token received from Microsoft',
    });
  });
});
