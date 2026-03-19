import { NextRequest } from 'next/server';
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
    shouldBypassForDev: false,
  })),
  verifyTurnstileToken: (
    ...args: Parameters<typeof mocks.verifyTurnstileToken>
  ) => mocks.verifyTurnstileToken(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  checkOTPSendAllowed: (
    ...args: Parameters<typeof mocks.checkOTPSendAllowed>
  ) => mocks.checkOTPSendAllowed(...args),
  extractIPFromHeaders: (
    ...args: Parameters<typeof mocks.extractIPFromHeaders>
  ) => mocks.extractIPFromHeaders(...args),
  logAbuseEvent: (...args: Parameters<typeof mocks.logAbuseEvent>) =>
    mocks.logAbuseEvent(...args),
  recordOTPSendSuccess: (
    ...args: Parameters<typeof mocks.recordOTPSendSuccess>
  ) => mocks.recordOTPSendSuccess(...args),
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
}));

describe('mobile send-otp route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.headers.mockResolvedValue(new Headers());
    mocks.extractIPFromHeaders.mockReturnValue('198.51.100.25');
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

  it('does not consume quota when infrastructure blocks the email', async () => {
    mocks.checkEmailInfrastructureBlocked.mockResolvedValue({
      isBlocked: true,
      blockType: 'bounce',
    });

    const { POST } = await import('@/app/api/v1/auth/mobile/send-otp/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/mobile/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'person@example.com', locale: 'en' }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.recordOTPSendSuccess).not.toHaveBeenCalled();
    expect(mocks.logAbuseEvent).toHaveBeenCalledWith(
      '198.51.100.25',
      'otp_send',
      expect.objectContaining({
        metadata: expect.objectContaining({ stage: 'infrastructure_block' }),
      })
    );
  });

  it('records quota only after a successful OTP send', async () => {
    const { POST } = await import('@/app/api/v1/auth/mobile/send-otp/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/mobile/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'person@example.com', locale: 'en' }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.recordOTPSendSuccess).toHaveBeenCalledWith(
      '198.51.100.25',
      'person@example.com'
    );
  });

  it('does not consume quota when Supabase rejects signInWithOtp', async () => {
    mocks.signInWithOtp.mockResolvedValue({
      error: { message: 'supabase failure', code: 'otp_failed', status: 500 },
    });

    const { POST } = await import('@/app/api/v1/auth/mobile/send-otp/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/mobile/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'person@example.com', locale: 'en' }),
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.recordOTPSendSuccess).not.toHaveBeenCalled();
    expect(mocks.logAbuseEvent).toHaveBeenCalledWith(
      '198.51.100.25',
      'otp_send',
      expect.objectContaining({
        metadata: expect.objectContaining({ stage: 'sign_in_with_otp' }),
      })
    );
  });
});
