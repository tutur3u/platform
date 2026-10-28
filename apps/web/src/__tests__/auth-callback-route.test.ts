import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuthDiagnosticCode: vi.fn(),
  createClient: vi.fn(),
  signOut: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getExternalAppByReturnUrl: vi.fn(),
  getReturnUrlKind: vi.fn(),
  logAuthDiagnostic: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: (
    ...args: Parameters<typeof mocks.getExternalAppByReturnUrl>
  ) => mocks.getExternalAppByReturnUrl(...args),
}));

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: (
    ...args: Parameters<typeof mocks.createAuthDiagnosticCode>
  ) => mocks.createAuthDiagnosticCode(...args),
  getReturnUrlKind: (...args: Parameters<typeof mocks.getReturnUrlKind>) =>
    mocks.getReturnUrlKind(...args),
  logAuthDiagnostic: (...args: Parameters<typeof mocks.logAuthDiagnostic>) =>
    mocks.logAuthDiagnostic(...args),
}));

function clearConfiguredWebOrigins() {
  vi.stubEnv('PORTLESS_URL', '');
  vi.stubEnv('BASE_URL', '');
  vi.stubEnv('PORTLESS_PORT', '');
  vi.stubEnv('WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  vi.stubEnv('COOLIFY_URL', '');
  vi.stubEnv('COOLIFY_FQDN', '');
}

describe('auth callback route', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearConfiguredWebOrigins();
    mocks.createAuthDiagnosticCode.mockReturnValue('AUTH-OAUTH-ABC123');
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        signOut: mocks.signOut,
      },
    });
    mocks.exchangeCodeForSession.mockResolvedValue(undefined);
    mocks.getExternalAppByReturnUrl.mockResolvedValue(null);
    mocks.getReturnUrlKind.mockReturnValue('external');
  });

  const staffTenant = '11111111-1111-1111-1111-111111111111';
  const foreignTenant = '22222222-2222-2222-2222-222222222222';

  it.each([
    ['foreign tenant', foreignTenant, staffTenant, 'oauth', false],
    ['staff tenant', staffTenant, staffTenant, 'oauth', true],
    ['unset configuration', staffTenant, '', 'oauth', false],
    ['email recovery with an Azure identity', foreignTenant, '', 'otp', true],
    ['missing identity tenant', undefined, staffTenant, 'oauth', false],
  ])('%s', async (_name, tenant, configured, method, allowed) => {
    vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
    const payload = Buffer.from(JSON.stringify({ amr: [{ method }] })).toString(
      'base64url'
    );
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        session: {
          access_token: `e30.${payload}.signature`,
          user: {
            app_metadata: { provider: 'azure' },
            identities: [{ provider: 'azure', identity_data: { tid: tenant } }],
          },
        },
      },
      error: null,
    });
    const { GET } = await import('@/app/api/auth/callback/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/auth/callback?code=test&multiAccount=true'
      )
    );
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe(allowed ? '/add-account' : '/login');
    if (allowed) {
      expect(mocks.signOut).not.toHaveBeenCalled();
    } else {
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(location.searchParams.get('error')).toBe(
        'azure_tenant_restricted'
      );
    }
  });

  it('adds a safe diagnostic code when OAuth exchange fails', async () => {
    mocks.exchangeCodeForSession.mockRejectedValue(
      new Error('provider exchange failed')
    );

    const { GET } = await import('@/app/api/auth/callback/route');
    const response = await GET(
      new NextRequest(
        'http://0.0.0.0:7803/api/auth/callback?code=bad-code&returnUrl=https%3A%2F%2Ftuturuuu.com%2Fverify-token%3FnextUrl%3D%2Fonboarding'
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).not.toContain('0.0.0.0');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('auth_failed');
    expect(location.searchParams.get('diagnosticCode')).toBe(
      'AUTH-OAUTH-ABC123'
    );
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'oauth',
        code: 'AUTH-OAUTH-ABC123',
        returnUrlKind: 'external',
        route: '/api/auth/callback',
        stage: 'oauth_callback_exchange',
      })
    );
  });

  it('adds a safe diagnostic code when OAuth exchange returns an error', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('invalid callback code'),
    });

    const { GET } = await import('@/app/api/auth/callback/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/auth/callback?code=bad-code&multiAccount=true&returnUrl=%2Fen%2Fpersonal%2Ftasks'
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('http://localhost');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('auth_failed');
    expect(location.searchParams.get('diagnosticCode')).toBe(
      'AUTH-OAUTH-ABC123'
    );
    expect(location.pathname).not.toBe('/add-account');
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'oauth',
        code: 'AUTH-OAUTH-ABC123',
        route: '/api/auth/callback',
        stage: 'oauth_callback_exchange',
      })
    );
  });

  it('does not preserve wildcard listener origins for external app confirmation redirects', async () => {
    mocks.getExternalAppByReturnUrl.mockResolvedValue({ id: 'tulearn' });

    const { GET } = await import('@/app/api/auth/callback/route');
    const response = await GET(
      new NextRequest(
        'http://0.0.0.0:7803/api/auth/callback?returnUrl=https%3A%2F%2Flearn.tuturuuu.com%2Fverify-token%3FnextUrl%3D%2Fonboarding'
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).not.toContain('0.0.0.0');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(
      'https://learn.tuturuuu.com/verify-token?nextUrl=/onboarding'
    );
  });

  it('preserves a local Portless port for multi-account callback redirects', async () => {
    clearConfiguredWebOrigins();

    const { GET } = await import('@/app/api/auth/callback/route');
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.localhost:1355/api/auth/callback?multiAccount=true&returnUrl=%2Fen%2Fpersonal%2Ftasks',
        {
          headers: {
            'x-forwarded-host': 'tuturuuu.localhost',
            'x-forwarded-proto': 'https',
          },
        }
      )
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.localhost:1355');
    expect(location.pathname).toBe('/add-account');
    expect(location.searchParams.get('returnUrl')).toBe('/en/personal/tasks');
  });
});
