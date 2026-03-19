import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const updateUserById = vi.fn();
  const signInWithOtp = vi.fn();
  const signUp = vi.fn();
  const headers = vi.fn();
  const verifyTurnstileToken = vi.fn();
  const isTurnstileError = vi.fn();
  const checkOTPSendAllowed = vi.fn();
  const recordOTPSendSuccess = vi.fn();
  const logAbuseEvent = vi.fn();
  const extractIPFromHeaders = vi.fn();
  const checkEmailInfrastructureBlocked = vi.fn();
  const checkIfUserExists = vi.fn();
  const validateEmail = vi.fn();
  const generateRandomPassword = vi.fn();

  return {
    updateUserById,
    signInWithOtp,
    signUp,
    headers,
    verifyTurnstileToken,
    isTurnstileError,
    checkOTPSendAllowed,
    recordOTPSendSuccess,
    logAbuseEvent,
    extractIPFromHeaders,
    checkEmailInfrastructureBlocked,
    checkIfUserExists,
    validateEmail,
    generateRandomPassword,
    adminSupabase: {
      auth: {
        admin: {
          updateUserById,
        },
      },
    },
    sessionSupabase: {
      auth: {
        signInWithOtp,
        signUp,
      },
    },
  };
});

vi.mock('next/headers', () => ({
  headers: (...args: Parameters<typeof mocks.headers>) =>
    mocks.headers(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/turnstile/server', () => ({
  isTurnstileError: (...args: Parameters<typeof mocks.isTurnstileError>) =>
    mocks.isTurnstileError(...args),
  resolveTurnstileToken: vi.fn(() => ({
    captchaToken: 'captcha-token',
    captchaOptions: {},
  })),
  verifyTurnstileToken: (
    ...args: Parameters<typeof mocks.verifyTurnstileToken>
  ) => mocks.verifyTurnstileToken(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  checkOTPSendAllowed: (
    ...args: Parameters<typeof mocks.checkOTPSendAllowed>
  ) => mocks.checkOTPSendAllowed(...args),
  checkOTPVerifyLimit: vi.fn(),
  checkPasswordLoginLimit: vi.fn(),
  clearOTPVerifyFailures: vi.fn(),
  clearPasswordLoginFailures: vi.fn(),
  extractIPFromHeaders: (
    ...args: Parameters<typeof mocks.extractIPFromHeaders>
  ) => mocks.extractIPFromHeaders(...args),
  logAbuseEvent: (...args: Parameters<typeof mocks.logAbuseEvent>) =>
    mocks.logAbuseEvent(...args),
  recordOTPSendSuccess: (
    ...args: Parameters<typeof mocks.recordOTPSendSuccess>
  ) => mocks.recordOTPSendSuccess(...args),
  recordOTPVerifyFailure: vi.fn(),
  recordPasswordLoginFailure: vi.fn(),
}));

vi.mock('@tuturuuu/utils/email/server', () => ({
  checkEmailInfrastructureBlocked: (
    ...args: Parameters<typeof mocks.checkEmailInfrastructureBlocked>
  ) => mocks.checkEmailInfrastructureBlocked(...args),
  checkIfUserExists: (...args: Parameters<typeof mocks.checkIfUserExists>) =>
    mocks.checkIfUserExists(...args),
  generateRandomPassword: (
    ...args: Parameters<typeof mocks.generateRandomPassword>
  ) => mocks.generateRandomPassword(...args),
  validateEmail: (...args: Parameters<typeof mocks.validateEmail>) =>
    mocks.validateEmail(...args),
  validateOtp: vi.fn(),
}));

describe('sendOtpAction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.headers.mockResolvedValue(new Headers());
    mocks.extractIPFromHeaders.mockReturnValue('203.0.113.10');
    mocks.validateEmail.mockResolvedValue('person@example.com');
    mocks.checkOTPSendAllowed.mockResolvedValue({ allowed: true });
    mocks.checkEmailInfrastructureBlocked.mockResolvedValue({
      isBlocked: false,
    });
    mocks.checkIfUserExists.mockResolvedValue('user-1');
    mocks.verifyTurnstileToken.mockResolvedValue(undefined);
    mocks.isTurnstileError.mockReturnValue(false);
    mocks.updateUserById.mockResolvedValue({ error: null });
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    mocks.signUp.mockResolvedValue({ error: null });
    mocks.recordOTPSendSuccess.mockResolvedValue(undefined);
    mocks.generateRandomPassword.mockReturnValue('password123');
  });

  it('records OTP quota consumption only after provider acceptance', async () => {
    const { sendOtpAction } = await import(
      '@/app/[locale]/(marketing)/login/actions'
    );

    const result = await sendOtpAction({
      email: 'person@example.com',
      locale: 'en',
      captchaToken: 'captcha-token',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.recordOTPSendSuccess).toHaveBeenCalledWith(
      '203.0.113.10',
      'person@example.com'
    );
  });

  it('does not consume quota when captcha verification fails', async () => {
    const captchaError = new Error('captcha failed');
    mocks.verifyTurnstileToken.mockRejectedValue(captchaError);
    mocks.isTurnstileError.mockImplementation(
      (error) => error === captchaError
    );

    const { sendOtpAction } = await import(
      '@/app/[locale]/(marketing)/login/actions'
    );

    const result = await sendOtpAction({
      email: 'person@example.com',
      locale: 'en',
      captchaToken: 'captcha-token',
    });

    expect(result).toEqual({
      error: 'Verification failed. Please try again.',
    });
    expect(mocks.recordOTPSendSuccess).not.toHaveBeenCalled();
    expect(mocks.logAbuseEvent).toHaveBeenCalledWith(
      '203.0.113.10',
      'otp_send',
      expect.objectContaining({
        email: 'person@example.com',
        success: false,
        metadata: expect.objectContaining({ stage: 'captcha' }),
      })
    );
  });

  it('does not consume quota when user metadata update fails', async () => {
    mocks.updateUserById.mockResolvedValue({
      error: { message: 'update failed' },
    });

    const { sendOtpAction } = await import(
      '@/app/[locale]/(marketing)/login/actions'
    );

    const result = await sendOtpAction({
      email: 'person@example.com',
      locale: 'en',
      captchaToken: 'captcha-token',
    });

    expect(result).toEqual({ error: 'update failed' });
    expect(mocks.recordOTPSendSuccess).not.toHaveBeenCalled();
    expect(mocks.logAbuseEvent).toHaveBeenCalledWith(
      '203.0.113.10',
      'otp_send',
      expect.objectContaining({
        metadata: expect.objectContaining({ stage: 'update_user' }),
      })
    );
  });

  it('does not consume quota when Supabase rejects signInWithOtp', async () => {
    mocks.signInWithOtp.mockResolvedValue({
      error: { message: 'supabase failure', code: 'otp_failed', status: 500 },
    });

    const { sendOtpAction } = await import(
      '@/app/[locale]/(marketing)/login/actions'
    );

    const result = await sendOtpAction({
      email: 'person@example.com',
      locale: 'en',
      captchaToken: 'captcha-token',
    });

    expect(result).toEqual({ error: 'supabase failure' });
    expect(mocks.recordOTPSendSuccess).not.toHaveBeenCalled();
    expect(mocks.logAbuseEvent).toHaveBeenCalledWith(
      '203.0.113.10',
      'otp_send',
      expect.objectContaining({
        metadata: expect.objectContaining({ stage: 'sign_in_with_otp' }),
      })
    );
  });
});
