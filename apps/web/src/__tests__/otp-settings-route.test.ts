import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuthDiagnosticCode: vi.fn(),
  getPublicOtpSettings: vi.fn(),
  logAuthDiagnostic: vi.fn(),
}));

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: (
    ...args: Parameters<typeof mocks.createAuthDiagnosticCode>
  ) => mocks.createAuthDiagnosticCode(...args),
  logAuthDiagnostic: (...args: Parameters<typeof mocks.logAuthDiagnostic>) =>
    mocks.logAuthDiagnostic(...args),
}));

vi.mock('@/lib/auth/otp', () => ({
  getPublicOtpSettings: (
    ...args: Parameters<typeof mocks.getPublicOtpSettings>
  ) => mocks.getPublicOtpSettings(...args),
}));

describe('otp settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthDiagnosticCode.mockReturnValue('AUTH-OTP-SETTINGS-ABC123');
  });

  it('allows web requests without a platform query param', async () => {
    mocks.getPublicOtpSettings.mockResolvedValue({ otpEnabled: true });

    const { GET } = await import('@/app/api/v1/auth/otp/settings/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/auth/otp/settings?client=web&platform='
      )
    );

    expect(mocks.getPublicOtpSettings).toHaveBeenCalledWith({
      client: 'web',
      platform: undefined,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ otpEnabled: true });
  });

  it('fails open for web settings when the config lookup fails', async () => {
    mocks.getPublicOtpSettings.mockRejectedValue(new Error('database down'));

    const { GET } = await import('@/app/api/v1/auth/otp/settings/route');
    const response = await GET(
      new NextRequest('http://localhost/api/v1/auth/otp/settings?client=web')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-OTP-SETTINGS-ABC123',
      otpEnabled: false,
    });
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'web',
        code: 'AUTH-OTP-SETTINGS-ABC123',
        route: '/api/v1/auth/otp/settings',
        stage: 'otp_settings',
      })
    );
  });

  it('keeps mobile settings fail-closed when policy loading fails', async () => {
    mocks.getPublicOtpSettings.mockRejectedValue(new Error('invalid policy'));

    const { GET } = await import('@/app/api/v1/auth/otp/settings/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/auth/otp/settings?client=mobile&platform=ios'
      )
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-OTP-SETTINGS-ABC123',
      error: 'Failed to load OTP settings',
    });
  });
});
