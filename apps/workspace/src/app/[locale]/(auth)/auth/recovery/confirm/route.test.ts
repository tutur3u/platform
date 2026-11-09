import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  consumeAuthRecoveryCredential: vi.fn(),
  createAuthDiagnosticCode: vi.fn(),
  logAuthDiagnostic: vi.fn(),
  setAuthRecoverySessionCookies: vi.fn(),
}));

vi.mock('@/lib/auth/recovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/recovery')>();

  return {
    ...actual,
    consumeAuthRecoveryCredential: (
      ...args: Parameters<typeof mocks.consumeAuthRecoveryCredential>
    ) => mocks.consumeAuthRecoveryCredential(...args),
    setAuthRecoverySessionCookies: (
      ...args: Parameters<typeof mocks.setAuthRecoverySessionCookies>
    ) => mocks.setAuthRecoverySessionCookies(...args),
  };
});

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: (
    ...args: Parameters<typeof mocks.createAuthDiagnosticCode>
  ) => mocks.createAuthDiagnosticCode(...args),
  logAuthDiagnostic: (...args: Parameters<typeof mocks.logAuthDiagnostic>) =>
    mocks.logAuthDiagnostic(...args),
}));

function clearConfiguredAuthOrigins() {
  vi.stubEnv('PORTLESS_URL', '');
  vi.stubEnv('BASE_URL', '');
  vi.stubEnv('PORTLESS_PORT', '');
  vi.stubEnv('WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  vi.stubEnv('COOLIFY_URL', '');
  vi.stubEnv('COOLIFY_FQDN', '');
}

function params(locale = 'en') {
  return { params: Promise.resolve({ locale }) };
}

describe('auth recovery confirm route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearConfiguredAuthOrigins();
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');
    mocks.createAuthDiagnosticCode.mockReturnValue('AUTH-REC-ABC123');
    mocks.consumeAuthRecoveryCredential.mockResolvedValue({
      email: 'person@example.com',
      redirectTo: '/onboarding',
      session: {
        access_token: 'access',
        expires_at: null,
        expires_in: 3600,
        refresh_token: 'refresh',
        token_type: 'bearer',
      },
    });
    mocks.setAuthRecoverySessionCookies.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('redirects successful confirmations through the public origin', async () => {
    const request = new NextRequest(
      'http://0.0.0.0:7803/en/auth/recovery/confirm?token=secret-token&next=%2Fen%2Fonboarding'
    );

    const response = await GET(request, params());

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/onboarding'
    );
    expect(response.headers.get('location')).not.toContain('0.0.0.0');
    expect(mocks.consumeAuthRecoveryCredential).toHaveBeenCalledWith({
      next: '/en/onboarding',
      request,
      token: 'secret-token',
    });
    expect(mocks.setAuthRecoverySessionCookies).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ access_token: 'access' })
    );
  });

  it('redirects missing tokens to the default-locale recovery page', async () => {
    const response = await GET(
      new NextRequest('http://0.0.0.0:7803/en/auth/recovery/confirm'),
      params()
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/auth/recovery?error=invalid'
    );
    expect(mocks.consumeAuthRecoveryCredential).not.toHaveBeenCalled();
  });

  it('redirects invalid tokens to the public recovery page with diagnostics', async () => {
    const error = new Error('expired');
    mocks.consumeAuthRecoveryCredential.mockRejectedValue(error);

    const response = await GET(
      new NextRequest(
        'http://0.0.0.0:7803/en/auth/recovery/confirm?token=expired-token'
      ),
      params()
    );

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/auth/recovery');
    expect(location.searchParams.get('error')).toBe('invalid');
    expect(location.searchParams.get('diagnostic')).toBe('AUTH-REC-ABC123');
    expect(location.toString()).not.toContain('0.0.0.0');
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH-REC-ABC123',
        error,
        route: '/en/auth/recovery/confirm',
        stage: 'auth_recovery_confirm',
      })
    );
  });
});
