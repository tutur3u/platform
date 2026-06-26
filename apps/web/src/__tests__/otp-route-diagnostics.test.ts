import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAuthDiagnosticCode: vi.fn(),
  logAuthDiagnostic: vi.fn(),
  sendOtp: vi.fn(),
  toOtpErrorResult: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: (
    ...args: Parameters<typeof mocks.createAuthDiagnosticCode>
  ) => mocks.createAuthDiagnosticCode(...args),
  logAuthDiagnostic: (...args: Parameters<typeof mocks.logAuthDiagnostic>) =>
    mocks.logAuthDiagnostic(...args),
}));

vi.mock('@/lib/auth/otp', () => ({
  OtpSendRequestSchema: {
    safeParse: (value: unknown) => ({
      data: value,
      success: true,
    }),
  },
  OtpVerifyRequestSchema: {
    safeParse: (value: unknown) => ({
      data: value,
      success: true,
    }),
  },
  sendOtp: (...args: Parameters<typeof mocks.sendOtp>) =>
    mocks.sendOtp(...args),
  toOtpErrorResult: (...args: Parameters<typeof mocks.toOtpErrorResult>) =>
    mocks.toOtpErrorResult(...args),
  verifyOtp: (...args: Parameters<typeof mocks.verifyOtp>) =>
    mocks.verifyOtp(...args),
}));

describe('OTP route diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAuthDiagnosticCode.mockImplementation((stage: string) =>
      stage === 'otp_send' ? 'AUTH-OTP-SEND-ABC123' : 'AUTH-OTP-VERIFY-ABC123'
    );
    mocks.toOtpErrorResult.mockImplementation((_error: unknown, fallback) => ({
      body: {
        error:
          fallback === 'send'
            ? 'Unable to send a verification code right now.'
            : 'Verification failed. Please try again.',
      },
      status: 500,
    }));
  });

  it('returns and logs a diagnostic code for OTP send route throws', async () => {
    mocks.sendOtp.mockRejectedValue(new Error('mail provider failed'));

    const { POST } = await import('@/app/api/v1/auth/otp/send/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/otp/send', {
        body: JSON.stringify({
          client: 'web',
          email: 'person@example.com',
          locale: 'en',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-OTP-SEND-ABC123',
      error: 'Unable to send a verification code right now.',
    });
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'otp',
        code: 'AUTH-OTP-SEND-ABC123',
        route: '/api/v1/auth/otp/send',
        stage: 'otp_send',
      })
    );
  });

  it('returns and logs a diagnostic code for OTP verify route throws', async () => {
    mocks.verifyOtp.mockRejectedValue(new Error('verify provider failed'));

    const { POST } = await import('@/app/api/v1/auth/otp/verify/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/otp/verify', {
        body: JSON.stringify({
          client: 'web',
          email: 'person@example.com',
          locale: 'en',
          otp: '123456',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      diagnosticCode: 'AUTH-OTP-VERIFY-ABC123',
      error: 'Verification failed. Please try again.',
    });
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'otp',
        code: 'AUTH-OTP-VERIFY-ABC123',
        route: '/api/v1/auth/otp/verify',
        stage: 'otp_verify',
      })
    );
  });

  it('returns retry and public IP diagnostics for OTP send rate limits', async () => {
    mocks.sendOtp.mockResolvedValue({
      body: {
        error: 'Too many OTP requests. Please try again later.',
        retryAfter: 42,
      },
      status: 429,
    });

    const { POST } = await import('@/app/api/v1/auth/otp/send/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/otp/send', {
        body: JSON.stringify({
          client: 'web',
          email: 'person@example.com',
          locale: 'en',
        }),
        headers: {
          'cf-connecting-ip': '203.0.113.42',
        },
        method: 'POST',
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(response.headers.get('X-RateLimit-Client-IP')).toBe('203.0.113.42');
    expect(response.headers.get('X-RateLimit-Policy')).toBe('otp-send');
    expect(response.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
  });

  it('returns retry and public IP diagnostics for OTP verify rate limits', async () => {
    mocks.verifyOtp.mockResolvedValue({
      body: {
        error: 'Too many failed verification attempts for this email',
        retryAfter: 60,
      },
      status: 429,
    });

    const { POST } = await import('@/app/api/v1/auth/otp/verify/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/otp/verify', {
        body: JSON.stringify({
          client: 'web',
          email: 'person@example.com',
          locale: 'en',
          otp: '123456',
        }),
        headers: {
          'cf-connecting-ip': '198.51.100.10',
        },
        method: 'POST',
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('X-RateLimit-Client-IP')).toBe('198.51.100.10');
    expect(response.headers.get('X-RateLimit-Policy')).toBe('otp-verify');
    expect(response.headers.get('X-RateLimit-Caller-Class')).toBe('anonymous');
  });
});
