import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAuthCodeUrlMock,
  normalizeWorkspaceIdMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  getAuthCodeUrlMock: vi.fn(),
  normalizeWorkspaceIdMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/microsoft', () => ({
  ConfidentialClientApplication: vi.fn(
    function ConfidentialClientApplication(this: {
      getAuthCodeUrl: typeof getAuthCodeUrlMock;
    }) {
      this.getAuthCodeUrl = getAuthCodeUrlMock;
    }
  ),
  createMsalConfig: vi.fn(() => ({})),
  MICROSOFT_CALENDAR_SCOPES: ['Calendars.ReadWrite'],
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

import { verifyCalendarOAuthState } from '@/lib/calendar/calendar-oauth-state';
import { GET } from './route';

const SECRET = 'microsoft-client-secret';

function startRequest() {
  return new NextRequest(
    'https://calendar.tuturuuu.com/api/v1/calendar/auth/microsoft?wsId=personal'
  );
}

describe('Microsoft Calendar auth route', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv('MICROSOFT_CLIENT_ID', 'microsoft-client-id');
    vi.stubEnv('MICROSOFT_CLIENT_SECRET', SECRET);
    vi.stubEnv(
      'MICROSOFT_REDIRECT_URI',
      'https://calendar.tuturuuu.com/api/v1/calendar/auth/microsoft/callback'
    );
    vi.stubEnv('CALENDAR_APP_URL', 'https://calendar.tuturuuu.com');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    normalizeWorkspaceIdMock.mockResolvedValue('workspace-1');
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: 'user-1' },
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    getAuthCodeUrlMock.mockResolvedValue('https://login.example/authorize');
  });

  it('fails closed in production without the single-use state store', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await GET(startRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Calendar connection is temporarily unavailable',
    });
    expect(getAuthCodeUrlMock).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().join(' ')).toContain(
      'UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN'
    );
    consoleError.mockRestore();
  });

  it('issues a signed state and PKCE cookie once production is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://store.example');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token');

    const response = await GET(startRequest());
    const [request] = getAuthCodeUrlMock.mock.calls[0] as [
      { codeChallengeMethod: string; state: string },
    ];

    expect(response.status).toBe(200);
    expect(request.codeChallengeMethod).toBe('S256');
    expect(
      verifyCalendarOAuthState('microsoft', request.state, SECRET)
    ).toMatchObject({
      ok: true,
      userId: 'user-1',
      wsId: 'workspace-1',
    });
    expect(response.cookies.get('ms_pkce_verifier')?.httpOnly).toBe(true);
  });
});
