import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuthDiagnosticCode: vi.fn(),
  logAuthDiagnostic: vi.fn(),
  passwordLogin: vi.fn(),
  toPasswordLoginErrorResult: vi.fn(),
}));

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: (
    ...args: Parameters<typeof mocks.createAuthDiagnosticCode>
  ) => mocks.createAuthDiagnosticCode(...args),
  logAuthDiagnostic: (...args: Parameters<typeof mocks.logAuthDiagnostic>) =>
    mocks.logAuthDiagnostic(...args),
}));

vi.mock('@/lib/auth/password', () => ({
  PasswordLoginRequestSchema: {
    safeParse: (value: unknown) => ({
      data: value,
      success: true,
    }),
  },
  passwordLogin: (...args: Parameters<typeof mocks.passwordLogin>) =>
    mocks.passwordLogin(...args),
  toPasswordLoginErrorResult: (
    ...args: Parameters<typeof mocks.toPasswordLoginErrorResult>
  ) => mocks.toPasswordLoginErrorResult(...args),
}));

describe('password-login route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthDiagnosticCode.mockReturnValue('AUTH-PASSWORD-ABC123');
    mocks.toPasswordLoginErrorResult.mockReturnValue({
      body: { error: 'Failed to login' },
      status: 500,
    });
  });

  it('delegates to the shared password service with the provided client context', async () => {
    mocks.passwordLogin.mockResolvedValue({
      body: { success: true },
      status: 200,
    });

    const { POST } = await import('@/app/api/v1/auth/password-login/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captchaToken: 'captcha-token',
          client: 'mobile',
          email: 'person@example.com',
          locale: 'en',
          password: 'password123',
        }),
      })
    );

    expect(mocks.passwordLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        captchaToken: 'captcha-token',
        client: 'mobile',
        email: 'person@example.com',
        password: 'password123',
      }),
      expect.objectContaining({
        client: 'mobile',
        endpoint: '/api/v1/auth/password-login',
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it('returns and logs a diagnostic code for unexpected password service throws', async () => {
    mocks.passwordLogin.mockRejectedValue(new Error('vault unavailable'));

    const { POST } = await import('@/app/api/v1/auth/password-login/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: 'web',
          email: 'person@example.com',
          locale: 'en',
          password: 'password123',
        }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-PASSWORD-ABC123',
      error: 'Failed to login',
    });
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'password',
        code: 'AUTH-PASSWORD-ABC123',
        route: '/api/v1/auth/password-login',
        stage: 'password_login',
      })
    );
  });
});
