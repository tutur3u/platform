import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const requestSignInWithOtp = vi.fn();
  const requestSignUp = vi.fn();
  const requestVerifyOtp = vi.fn();
  const requestGetSession = vi.fn();
  const requestClient = {
    auth: {
      getSession: requestGetSession,
      signInWithOtp: requestSignInWithOtp,
      signUp: requestSignUp,
      verifyOtp: requestVerifyOtp,
    },
  };

  const detachedVerifyOtp = vi.fn();
  const detachedSignInWithOtp = vi.fn();
  const detachedSignUp = vi.fn();
  const detachedClient = {
    auth: {
      signInWithOtp: detachedSignInWithOtp,
      signUp: detachedSignUp,
      verifyOtp: detachedVerifyOtp,
    },
  };

  const adminUpdateUserById = vi.fn();
  const adminSignInWithOtp = vi.fn();
  const adminSignUp = vi.fn();
  const adminClient = {
    auth: {
      admin: {
        updateUserById: adminUpdateUserById,
      },
      signInWithOtp: adminSignInWithOtp,
      signUp: adminSignUp,
    },
  };

  return {
    adminClient,
    adminSignInWithOtp,
    adminSignUp,
    adminUpdateUserById,
    checkEmailInfrastructureBlocked: vi.fn(),
    checkIfUserExists: vi.fn(),
    checkOTPSendAllowed: vi.fn(),
    checkOTPVerifyLimit: vi.fn(),
    classifyPotentialSpamUserAgent: vi.fn(),
    clearOTPVerifyFailures: vi.fn(),
    createAdminClient: vi.fn(),
    createClient: vi.fn(),
    createDetachedClient: vi.fn(),
    detachedClient,
    detachedSignInWithOtp,
    detachedSignUp,
    detachedVerifyOtp,
    extractIPFromHeaders: vi.fn(),
    extractUserAgentFromHeaders: vi.fn(),
    generateRandomPassword: vi.fn(),
    getMobileVersionPolicies: vi.fn(),
    getWebOtpEnabledConfig: vi.fn(),
    isTurnstileError: vi.fn(),
    logAbuseEvent: vi.fn(),
    prepareNormalAuthRecoveryOverrideUse: vi.fn(),
    recordOTPSendSuccess: vi.fn(),
    recordOTPVerifyFailure: vi.fn(),
    requestClient,
    requestGetSession,
    requestSignInWithOtp,
    requestSignUp,
    requestVerifyOtp,
    resolveTurnstileToken: vi.fn(),
    shouldBypassSupabaseAuthCaptchaForDev: vi.fn(),
    validateEmail: vi.fn(),
    validateOtp: vi.fn(),
    verifyTurnstileToken: vi.fn(),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
  createDetachedClient: (
    ...args: Parameters<typeof mocks.createDetachedClient>
  ) => mocks.createDetachedClient(...args),
}));

vi.mock('@tuturuuu/turnstile/server', () => ({
  isTurnstileError: (...args: Parameters<typeof mocks.isTurnstileError>) =>
    mocks.isTurnstileError(...args),
  resolveTurnstileToken: (
    ...args: Parameters<typeof mocks.resolveTurnstileToken>
  ) => mocks.resolveTurnstileToken(...args),
  verifyTurnstileToken: (
    ...args: Parameters<typeof mocks.verifyTurnstileToken>
  ) => mocks.verifyTurnstileToken(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  checkOTPSendAllowed: (
    ...args: Parameters<typeof mocks.checkOTPSendAllowed>
  ) => mocks.checkOTPSendAllowed(...args),
  checkOTPVerifyLimit: (
    ...args: Parameters<typeof mocks.checkOTPVerifyLimit>
  ) => mocks.checkOTPVerifyLimit(...args),
  classifyPotentialSpamUserAgent: (
    ...args: Parameters<typeof mocks.classifyPotentialSpamUserAgent>
  ) => mocks.classifyPotentialSpamUserAgent(...args),
  clearOTPVerifyFailures: (
    ...args: Parameters<typeof mocks.clearOTPVerifyFailures>
  ) => mocks.clearOTPVerifyFailures(...args),
  extractIPFromHeaders: (
    ...args: Parameters<typeof mocks.extractIPFromHeaders>
  ) => mocks.extractIPFromHeaders(...args),
  extractUserAgentFromHeaders: (
    ...args: Parameters<typeof mocks.extractUserAgentFromHeaders>
  ) => mocks.extractUserAgentFromHeaders(...args),
  logAbuseEvent: (...args: Parameters<typeof mocks.logAbuseEvent>) =>
    mocks.logAbuseEvent(...args),
  recordOTPSendSuccess: (
    ...args: Parameters<typeof mocks.recordOTPSendSuccess>
  ) => mocks.recordOTPSendSuccess(...args),
  recordOTPVerifyFailure: (
    ...args: Parameters<typeof mocks.recordOTPVerifyFailure>
  ) => mocks.recordOTPVerifyFailure(...args),
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
  validateOtp: (...args: Parameters<typeof mocks.validateOtp>) =>
    mocks.validateOtp(...args),
}));

vi.mock('@/lib/mobile-version-policy', () => ({
  getMobileVersionPolicies: (
    ...args: Parameters<typeof mocks.getMobileVersionPolicies>
  ) => mocks.getMobileVersionPolicies(...args),
  getWebOtpEnabledConfig: (
    ...args: Parameters<typeof mocks.getWebOtpEnabledConfig>
  ) => mocks.getWebOtpEnabledConfig(...args),
}));

vi.mock('./local-e2e', () => ({
  shouldBypassSupabaseAuthCaptchaForDev: (
    ...args: Parameters<typeof mocks.shouldBypassSupabaseAuthCaptchaForDev>
  ) => mocks.shouldBypassSupabaseAuthCaptchaForDev(...args),
}));

vi.mock('./recovery', () => ({
  prepareNormalAuthRecoveryOverrideUse: (
    ...args: Parameters<typeof mocks.prepareNormalAuthRecoveryOverrideUse>
  ) => mocks.prepareNormalAuthRecoveryOverrideUse(...args),
}));

describe('otp auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.extractIPFromHeaders.mockReturnValue('1.2.3.4');
    mocks.extractUserAgentFromHeaders.mockReturnValue('Mozilla/5.0');
    mocks.classifyPotentialSpamUserAgent.mockReturnValue({
      matchedPattern: null,
      normalizedUserAgent: 'Mozilla/5.0',
      reason: null,
      riskLevel: 'allow',
    });
    mocks.getWebOtpEnabledConfig.mockResolvedValue(true);
    mocks.getMobileVersionPolicies.mockResolvedValue({
      android: { otpEnabled: true },
      ios: { otpEnabled: true },
    });
    mocks.validateEmail.mockResolvedValue('person@example.com');
    mocks.validateOtp.mockResolvedValue('123456');
    mocks.checkOTPSendAllowed.mockResolvedValue({
      allowed: true,
      remainingAttempts: 5,
    });
    mocks.checkOTPVerifyLimit.mockResolvedValue({
      allowed: true,
      remainingAttempts: 5,
    });
    mocks.checkEmailInfrastructureBlocked.mockResolvedValue({
      isBlocked: false,
    });
    mocks.checkIfUserExists.mockResolvedValue('user-1');
    mocks.generateRandomPassword.mockReturnValue('random-password');
    mocks.resolveTurnstileToken.mockReturnValue({
      captchaToken: 'captcha-token',
      captchaOptions: { captchaToken: 'captcha-token' },
      shouldBypassForDev: false,
    });
    mocks.verifyTurnstileToken.mockResolvedValue(undefined);
    mocks.prepareNormalAuthRecoveryOverrideUse.mockResolvedValue(null);
    mocks.shouldBypassSupabaseAuthCaptchaForDev.mockReturnValue(false);
    mocks.createClient.mockResolvedValue(mocks.requestClient);
    mocks.createAdminClient.mockResolvedValue(mocks.adminClient);
    mocks.createDetachedClient.mockReturnValue(mocks.detachedClient);
    mocks.requestSignInWithOtp.mockResolvedValue({ error: null });
    mocks.requestSignUp.mockResolvedValue({ error: null });
    mocks.requestVerifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'access',
          expires_at: 123,
          expires_in: 3600,
          refresh_token: 'refresh',
          token_type: 'bearer',
          user: { id: 'user-1' },
        },
        user: { id: 'user-1' },
      },
      error: null,
    });
    mocks.detachedSignInWithOtp.mockResolvedValue({ error: null });
    mocks.detachedSignUp.mockResolvedValue({ error: null });
    mocks.adminUpdateUserById.mockResolvedValue({ error: null });
  });

  it('does not mutate existing user metadata before OTP verification', async () => {
    const { sendOtp } = await import('./otp');

    const result = await sendOtp(
      {
        captchaToken: 'captcha-token',
        client: 'web',
        deviceId: 'device-1',
        email: 'person@example.com',
        locale: 'vi',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/otp/send',
        headers: new Headers(),
      }
    );

    expect(result).toEqual({
      body: { success: true },
      status: 200,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.adminUpdateUserById).not.toHaveBeenCalled();
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.any(Object),
      }),
      'captcha-token'
    );
    expect(mocks.verifyTurnstileToken.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.checkOTPSendAllowed.mock.invocationCallOrder[0]!
    );
    expect(mocks.checkOTPSendAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requestSignInWithOtp.mock.invocationCallOrder[0]!
    );
    expect(mocks.requestSignInWithOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: {
        captchaToken: 'captcha-token',
        data: {
          auth_client: 'web',
          device_id: 'device-1',
          locale: 'vi',
          origin: 'TUTURUUU',
        },
      },
    });
  });

  it('does not send OTP when server-side Turnstile verification fails', async () => {
    const turnstileError = new Error('Turnstile verification failed');
    mocks.verifyTurnstileToken.mockRejectedValueOnce(turnstileError);

    const { sendOtp } = await import('./otp');

    await expect(
      sendOtp(
        {
          captchaToken: 'captcha-token',
          client: 'web',
          email: 'person@example.com',
          locale: 'en',
        },
        {
          client: 'web',
          endpoint: '/api/v1/auth/otp/send',
          headers: new Headers(),
        }
      )
    ).rejects.toBe(turnstileError);

    expect(mocks.requestSignInWithOtp).not.toHaveBeenCalled();
    expect(mocks.requestSignUp).not.toHaveBeenCalled();
    expect(mocks.checkOTPSendAllowed).not.toHaveBeenCalled();
    expect(mocks.recordOTPSendSuccess).not.toHaveBeenCalled();
  });

  it('uses the detached publishable-key client for local OTP sign-up', async () => {
    mocks.resolveTurnstileToken.mockReturnValue({
      captchaOptions: {},
      shouldBypassForDev: true,
    });
    mocks.checkIfUserExists.mockResolvedValue(undefined);

    const { sendOtp } = await import('./otp');
    const result = await sendOtp(
      {
        client: 'web',
        email: 'new-person@example.com',
        locale: 'en',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/otp/send',
        headers: new Headers(),
      }
    );

    expect(result).toEqual({
      body: { success: true },
      status: 200,
    });
    expect(mocks.createDetachedClient).toHaveBeenCalledOnce();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.detachedSignUp).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: {
        data: {
          auth_client: 'web',
          locale: 'en',
          origin: 'TUTURUUU',
        },
      },
      password: 'random-password',
    });
  });

  it('falls back to signup verification for a new account OTP', async () => {
    mocks.requestVerifyOtp
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: 'Token has wrong type' },
      })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'access',
            expires_at: 123,
            expires_in: 3600,
            refresh_token: 'refresh',
            token_type: 'bearer',
            user: { id: 'user-1' },
          },
          user: { id: 'user-1' },
        },
        error: null,
      });

    const { verifyOtp } = await import('./otp');
    const result = await verifyOtp(
      {
        client: 'web',
        email: 'new-person@example.com',
        locale: 'en',
        otp: '123456',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/otp/verify',
        headers: new Headers(),
      }
    );

    expect(result).toEqual({ body: { success: true }, status: 200 });
    expect(mocks.requestVerifyOtp).toHaveBeenNthCalledWith(1, {
      email: 'person@example.com',
      token: '123456',
      type: 'email',
    });
    expect(mocks.requestVerifyOtp).toHaveBeenNthCalledWith(2, {
      email: 'person@example.com',
      token: '123456',
      type: 'signup',
    });
    expect(mocks.recordOTPVerifyFailure).not.toHaveBeenCalled();
  });

  it('uses an active auth recovery override to bypass email-scoped OTP send blockers only', async () => {
    const { sendOtp } = await import('./otp');

    mocks.prepareNormalAuthRecoveryOverrideUse.mockResolvedValue({
      allowNormalLogin: true,
      allowRecoveryEmail: true,
      email: 'person@example.com',
      id: 'override-1',
    });
    mocks.checkEmailInfrastructureBlocked.mockResolvedValue({
      blockType: 'blacklist',
      isBlocked: true,
    });

    const result = await sendOtp(
      {
        captchaToken: 'captcha-token',
        client: 'web',
        email: 'person@example.com',
        locale: 'en',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/otp/send',
        headers: new Headers(),
      }
    );

    expect(result).toEqual({
      body: { success: true },
      status: 200,
    });
    expect(mocks.prepareNormalAuthRecoveryOverrideUse).toHaveBeenCalledWith({
      email: 'person@example.com',
      metadata: {
        client: 'web',
        platform: undefined,
        stage: 'otp_send',
      },
    });
    expect(mocks.checkEmailInfrastructureBlocked).not.toHaveBeenCalled();
    expect(mocks.checkOTPSendAllowed).toHaveBeenCalledWith(
      '1.2.3.4',
      undefined,
      {
        route: '/api/v1/auth/otp/send',
        source: 'otp-send',
      }
    );
    expect(mocks.verifyTurnstileToken).toHaveBeenCalled();
  });

  it('updates user metadata after a successful OTP verification', async () => {
    const { verifyOtp } = await import('./otp');

    const result = await verifyOtp(
      {
        client: 'web',
        deviceId: 'device-1',
        email: 'person@example.com',
        locale: 'vi',
        otp: '123456',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/otp/verify',
        headers: new Headers(),
      }
    );

    expect(result).toEqual({
      body: { success: true },
      status: 200,
    });
    expect(mocks.requestVerifyOtp).toHaveBeenCalledWith({
      email: 'person@example.com',
      token: '123456',
      type: 'email',
    });
    expect(mocks.adminUpdateUserById).toHaveBeenCalledWith('user-1', {
      user_metadata: {
        auth_client: 'web',
        device_id: 'device-1',
        locale: 'vi',
        origin: 'TUTURUUU',
      },
    });
  });
});
