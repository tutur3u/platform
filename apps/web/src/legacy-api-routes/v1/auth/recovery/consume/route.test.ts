import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  consumeAuthRecoveryCredential: vi.fn(),
  createAuthDiagnosticCode: vi.fn(),
  logAuthDiagnostic: vi.fn(),
  setAuthRecoverySessionCookies: vi.fn(),
}));

vi.mock('@/lib/auth/recovery', () => ({
  AUTH_RECOVERY_GENERIC_ERROR: 'Unable to complete account recovery right now.',
  consumeAuthRecoveryCredential: (
    ...args: Parameters<typeof mocks.consumeAuthRecoveryCredential>
  ) => mocks.consumeAuthRecoveryCredential(...args),
  setAuthRecoverySessionCookies: (
    ...args: Parameters<typeof mocks.setAuthRecoverySessionCookies>
  ) => mocks.setAuthRecoverySessionCookies(...args),
}));

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: (
    ...args: Parameters<typeof mocks.createAuthDiagnosticCode>
  ) => mocks.createAuthDiagnosticCode(...args),
  logAuthDiagnostic: (...args: Parameters<typeof mocks.logAuthDiagnostic>) =>
    mocks.logAuthDiagnostic(...args),
}));

function createRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/auth/recovery/consume', {
    body: JSON.stringify(body),
    method: 'POST',
  });
}

describe('auth recovery consume route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthDiagnosticCode.mockReturnValue('AUTH-REC-ABC123');
    mocks.consumeAuthRecoveryCredential.mockResolvedValue({
      email: 'person@example.com',
      redirectTo: '/en/personal',
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

  it('consumes a recovery code and sets normal auth cookies', async () => {
    const request = createRequest({
      code: '123456',
      email: 'person@example.com',
      next: '/en/personal',
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: 'person@example.com',
      redirectTo: '/en/personal',
      success: true,
    });
    expect(mocks.consumeAuthRecoveryCredential).toHaveBeenCalledWith({
      code: '123456',
      email: 'person@example.com',
      next: '/en/personal',
      request,
    });
    expect(mocks.setAuthRecoverySessionCookies).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        access_token: 'access',
      })
    );
  });

  it('returns a generic diagnostic response for invalid request bodies', async () => {
    const response = await POST(
      createRequest({
        code: 'not-a-code',
        email: 'person@example.com',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-REC-ABC123',
      error: 'Unable to complete account recovery right now.',
    });
    expect(mocks.consumeAuthRecoveryCredential).not.toHaveBeenCalled();
  });

  it('returns a generic diagnostic response when recovery fails', async () => {
    const error = new Error('expired');
    mocks.consumeAuthRecoveryCredential.mockRejectedValue(error);
    const request = createRequest({
      code: '123456',
      email: 'person@example.com',
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-REC-ABC123',
      error: 'Unable to complete account recovery right now.',
    });
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'AUTH-REC-ABC123',
        error,
        route: '/api/v1/auth/recovery/consume',
        stage: 'auth_recovery_consume',
      })
    );
  });
});
