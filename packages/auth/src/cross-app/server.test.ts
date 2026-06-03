import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPOST, createRefreshPOST } from './server';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: unknown[]) => mocks.createClient(...args),
}));

describe('cross-app server verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');

    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            session_data: { email: 'agent@example.com' },
            user_id: 'user-1',
          },
        ],
        error: null,
      }),
    });
  });

  it('sets an HttpOnly Tuturuuu app-session cookie without returning Supabase session tokens', async () => {
    const handler = createPOST('learn');

    const response = await handler(
      new NextRequest('https://learn.tuturuuu.com/api/auth/verify-app-token', {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      appSessionCreated: true,
      appSessionRefreshEarlySeconds: 900,
      userId: 'user-1',
      valid: true,
    });
    expect(response.headers.get('set-cookie')).toContain(
      'tuturuuu_app_session=ttr_app_'
    );
    expect(response.headers.get('set-cookie')).toContain(
      'tuturuuu_app_session_refresh=ttr_app_'
    );
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).not.toContain('Domain=');
  });

  it('uses central Web verification for satellite app-session cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        appSessionExpiresAt: '2026-01-01T00:00:00.000Z',
        appSessionRefreshEarlySeconds: 120,
        appSessionRefreshExpiresAt: '2026-01-31T00:00:00.000Z',
        appSessionRefreshToken: 'ttr_app_central-refresh',
        appSessionToken: 'ttr_app_central-session',
        internalAppSessionPolicy: {
          internalAppAccessTtlSeconds: 600,
          internalAppRefreshEarlySeconds: 120,
          internalAppRefreshTtlSeconds: 86_400,
        },
        sessionData: { email: 'learn@example.com' },
        userId: 'user-2',
        valid: true,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const handler = createPOST('learn', {
      verificationBaseUrl: 'https://tuturuuu.localhost',
    });

    const response = await handler(
      new NextRequest(
        'https://learn.tuturuuu.localhost/api/auth/verify-app-token',
        {
          body: JSON.stringify({ token: 'learn-token' }),
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      appSessionCreated: true,
      userId: 'user-2',
      valid: true,
    });

    const fetchCall = fetchMock.mock.calls[0];

    expect(fetchCall).toBeDefined();

    const [url, init] = fetchCall!;
    expect(String(url)).toBe(
      'https://tuturuuu.localhost/api/v1/auth/cross-app-token/verify'
    );
    expect(JSON.parse(init.body as string)).toEqual({
      targetApp: 'learn',
      token: 'learn-token',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('tuturuuu_app_session=ttr_app_');
    expect(setCookie).toContain('tuturuuu_app_session_refresh=ttr_app_');
    expect(setCookie).toContain(
      'tuturuuu_web_app_session=ttr_app_central-session'
    );
    expect(setCookie).toContain(
      'tuturuuu_web_app_session_refresh=ttr_app_central-refresh'
    );
  });

  it('does not require satellite signing secrets when Web returns app-session cookies', async () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', '');
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          appSessionExpiresAt: '2026-01-01T00:00:00.000Z',
          appSessionRefreshEarlySeconds: 120,
          appSessionRefreshExpiresAt: '2026-01-31T00:00:00.000Z',
          appSessionRefreshToken: 'ttr_app_central-refresh',
          appSessionToken: 'ttr_app_central-session',
          internalAppSessionPolicy: {
            internalAppAccessTtlSeconds: 600,
            internalAppRefreshEarlySeconds: 120,
            internalAppRefreshTtlSeconds: 86_400,
          },
          sessionData: { email: 'chat@example.com' },
          userId: 'user-2',
          valid: true,
        })
      )
    );

    const handler = createPOST('chat', {
      verificationBaseUrl: 'https://tuturuuu.localhost',
    });

    const response = await handler(
      new NextRequest(
        'https://chat.tuturuuu.localhost/api/auth/verify-app-token',
        {
          body: JSON.stringify({ token: 'chat-token' }),
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      appSessionCreated: true,
      appSessionRefreshEarlySeconds: 120,
      userId: 'user-2',
      valid: true,
    });

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('tuturuuu_app_session=ttr_app_');
    expect(setCookie).toContain('tuturuuu_app_session_refresh=ttr_app_');
    expect(setCookie).toContain(
      'tuturuuu_web_app_session=ttr_app_central-session'
    );
    expect(setCookie).toContain(
      'tuturuuu_web_app_session_refresh=ttr_app_central-refresh'
    );
  });

  it('refreshes satellite cookies with Web-issued app-session tokens without local signing secrets', async () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', '');
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        appSessionExpiresAt: '2026-01-01T00:00:00.000Z',
        appSessionRefreshEarlySeconds: 120,
        appSessionRefreshExpiresAt: '2026-01-31T00:00:00.000Z',
        appSessionRefreshToken: 'ttr_app_refreshed-refresh',
        appSessionToken: 'ttr_app_refreshed-session',
        internalAppSessionPolicy: {
          internalAppAccessTtlSeconds: 600,
          internalAppRefreshEarlySeconds: 120,
          internalAppRefreshTtlSeconds: 86_400,
        },
        sessionData: { email: 'chat@example.com' },
        userId: 'user-2',
        valid: true,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const handler = createRefreshPOST('chat', {
      verificationBaseUrl: 'https://tuturuuu.localhost',
    });

    const response = await handler(
      new NextRequest(
        'https://chat.tuturuuu.localhost/api/auth/refresh-app-session',
        {
          body: JSON.stringify({ refreshToken: 'ttr_app_existing-refresh' }),
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        '/api/v1/auth/cross-app-session/refresh',
        'https://tuturuuu.localhost'
      ),
      expect.objectContaining({
        body: JSON.stringify({
          refreshToken: 'ttr_app_existing-refresh',
          targetApp: 'chat',
        }),
      })
    );

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('tuturuuu_app_session=ttr_app_');
    expect(setCookie).toContain('tuturuuu_app_session_refresh=ttr_app_');
    expect(setCookie).toContain(
      'tuturuuu_web_app_session=ttr_app_refreshed-session'
    );
    expect(setCookie).toContain(
      'tuturuuu_web_app_session_refresh=ttr_app_refreshed-refresh'
    );
  });

  it('does not call central refresh verification with only an access token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const handler = createRefreshPOST('chat', {
      verificationBaseUrl: 'https://tuturuuu.localhost',
    });

    const response = await handler(
      new NextRequest(
        'https://chat.tuturuuu.localhost/api/auth/refresh-app-session',
        {
          body: JSON.stringify({ accessToken: 'ttr_app_existing-access' }),
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing app session refresh credentials',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints app-session cookies in satellite deployments with only the existing server-side Supabase secret', async () => {
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', '');
    vi.stubEnv('APP_COORDINATION_TOKEN_SECRET', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'supabase-server-secret');

    const handler = createPOST('learn');

    const response = await handler(
      new NextRequest('https://learn.tuturuuu.com/api/auth/verify-app-token', {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain(
      'tuturuuu_app_session=ttr_app_'
    );
  });

  it('returns Tuturuuu-managed app-session JWTs for CLI token exchange', async () => {
    const handler = createPOST('platform', {
      sessionKind: 'cli-app-session',
    });

    const response = await handler(
      new NextRequest('https://tuturuuu.com/api/cli/auth/verify', {
        body: JSON.stringify({ token: 'copy-token' }),
        method: 'POST',
      })
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      email: 'agent@example.com',
      session: {
        token_type: 'bearer',
      },
      sessionCreated: true,
      userId: 'user-1',
      valid: true,
    });
    expect(body.session.access_token).toMatch(/^ttr_app_/u);
    expect(body.session.refresh_token).toMatch(/^ttr_app_/u);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
