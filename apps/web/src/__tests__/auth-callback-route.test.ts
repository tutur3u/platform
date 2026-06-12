import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuthDiagnosticCode: vi.fn(),
  createClient: vi.fn(),
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
      },
    });
    mocks.exchangeCodeForSession.mockResolvedValue(undefined);
    mocks.getExternalAppByReturnUrl.mockResolvedValue(null);
    mocks.getReturnUrlKind.mockReturnValue('external');
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
