import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  passwordLogin: vi.fn(),
  sendOtp: vi.fn(),
  toPasswordLoginErrorResult: vi.fn(),
  toOtpErrorResult: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: (...args: Parameters<typeof mocks.headers>) =>
    mocks.headers(...args),
}));

vi.mock('@/lib/auth/otp', () => ({
  OTP_SPAM_BLOCK_ERROR: 'Unable to continue right now.',
  sendOtp: (...args: Parameters<typeof mocks.sendOtp>) =>
    mocks.sendOtp(...args),
  toOtpErrorResult: (...args: Parameters<typeof mocks.toOtpErrorResult>) =>
    mocks.toOtpErrorResult(...args),
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/auth/password', () => ({
  passwordLogin: (...args: Parameters<typeof mocks.passwordLogin>) =>
    mocks.passwordLogin(...args),
  toPasswordLoginErrorResult: (
    ...args: Parameters<typeof mocks.toPasswordLoginErrorResult>
  ) => mocks.toPasswordLoginErrorResult(...args),
}));

describe('login auth actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.toPasswordLoginErrorResult.mockReturnValue({
      body: { error: 'Failed to login' },
      status: 500,
    });
    mocks.toOtpErrorResult.mockReturnValue({
      body: { error: 'Unable to send a verification code right now.' },
      status: 500,
    });
  });

  it('delegates to the shared OTP service with a web client context', async () => {
    mocks.sendOtp.mockResolvedValue({
      body: { success: true },
      status: 200,
    });

    const { sendOtpAction } = await import(
      '@/app/[locale]/(marketing)/login/actions'
    );
    const result = await sendOtpAction({
      email: 'person@example.com',
      locale: 'en',
      captchaToken: 'captcha-token',
    });

    expect(mocks.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'web',
        email: 'person@example.com',
      }),
      expect.objectContaining({
        client: 'web',
        endpoint: '/login/actions/send-otp',
      })
    );
    expect(result).toEqual({ success: true });
  });

  it('delegates password login to the shared password service with a web client context', async () => {
    mocks.passwordLogin.mockResolvedValue({
      body: { success: true },
      status: 200,
    });

    const { passwordLoginAction } = await import(
      '@/app/[locale]/(marketing)/login/actions'
    );
    const result = await passwordLoginAction({
      email: 'person@example.com',
      locale: 'en',
      password: 'password123',
    });

    expect(mocks.passwordLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'web',
        email: 'person@example.com',
        password: 'password123',
      }),
      expect.objectContaining({
        client: 'web',
        endpoint: '/login/actions/password-login',
      })
    );
    expect(result).toEqual({ success: true });
  });
});
