import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generatedAuthUrlInputs,
  normalizeWorkspaceIdMock,
  oauthConstructors,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  generatedAuthUrlInputs: [] as Array<Record<string, unknown>>,
  normalizeWorkspaceIdMock: vi.fn(),
  oauthConstructors: [] as Array<Record<string, unknown>>,
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/google', () => ({
  OAuth2Client: vi.fn(function OAuth2Client(
    this: { generateAuthUrl: (input: Record<string, unknown>) => string },
    options: Record<string, unknown>
  ) {
    oauthConstructors.push(options);
    this.generateAuthUrl = (input: Record<string, unknown>) => {
      generatedAuthUrlInputs.push(input);
      const url = new URL('https://accounts.google.test/o/oauth2/v2/auth');
      url.searchParams.set('redirect_uri', String(options.redirectUri));
      url.searchParams.set('state', String(input.state));

      for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          url.searchParams.set(key, value.join(' '));
          continue;
        }
        url.searchParams.set(key, String(value));
      }

      return url.toString();
    };
  }),
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

describe('Google Calendar auth route', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    generatedAuthUrlInputs.length = 0;
    oauthConstructors.length = 0;
    normalizeWorkspaceIdMock.mockResolvedValue('workspace-1');
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: 'user-1' },
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
  });

  it('does not emit 0.0.0.0 in the Google redirect URI', async () => {
    vi.stubEnv(
      'GOOGLE_REDIRECT_URI',
      'http://0.0.0.0:7803/api/v1/calendar/auth/callback'
    );
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');

    const response = await GET(
      new NextRequest('http://0.0.0.0:7803/api/v1/calendar/auth?wsId=personal')
    );
    const body = (await response.json()) as { authUrl: string };
    const redirectUri = new URL(body.authUrl).searchParams.get('redirect_uri');

    expect(response.status).toBe(200);
    expect(redirectUri).toBe(
      'https://tuturuuu.com/api/v1/calendar/auth/callback'
    );
    expect(body.authUrl).not.toContain('0.0.0.0');
  });

  it('keeps a valid localhost Google redirect URI for development', async () => {
    vi.stubEnv(
      'GOOGLE_REDIRECT_URI',
      'http://localhost:7803/api/v1/calendar/auth/callback'
    );

    const response = await GET(
      new NextRequest('http://0.0.0.0:7803/api/v1/calendar/auth?wsId=personal')
    );
    const body = (await response.json()) as { authUrl: string };

    expect(new URL(body.authUrl).searchParams.get('redirect_uri')).toBe(
      'http://localhost:7803/api/v1/calendar/auth/callback'
    );
  });

  it('requests offline access without forcing consent on normal reconnects', async () => {
    const response = await GET(
      new NextRequest('https://tuturuuu.com/api/v1/calendar/auth?wsId=personal')
    );
    const body = (await response.json()) as { authUrl: string };
    const authUrl = new URL(body.authUrl);

    expect(response.status).toBe(200);
    expect(authUrl.searchParams.get('access_type')).toBe('offline');
    expect(authUrl.searchParams.get('include_granted_scopes')).toBe('true');
    expect(authUrl.searchParams.has('prompt')).toBe(false);
    expect(generatedAuthUrlInputs[0]).toMatchObject({
      access_type: 'offline',
      include_granted_scopes: true,
      state: 'workspace-1',
    });
    expect(generatedAuthUrlInputs[0]).not.toHaveProperty('prompt');
  });
});
