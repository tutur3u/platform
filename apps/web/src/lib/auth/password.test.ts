import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const browserSignInWithPassword = vi.fn();
  const browserGetSession = vi.fn();
  const browserClient = {
    auth: {
      getSession: browserGetSession,
      signInWithPassword: browserSignInWithPassword,
    },
  };

  const adminUpdateUserById = vi.fn();
  const adminClient = {
    auth: {
      admin: {
        updateUserById: adminUpdateUserById,
      },
    },
  };

  return {
    adminClient,
    adminUpdateUserById,
    browserClient,
    browserGetSession,
    browserSignInWithPassword,
    checkPasswordLoginLimit: vi.fn(),
    classifyPotentialSpamUserAgent: vi.fn(),
    clearPasswordLoginFailures: vi.fn(),
    createAdminClient: vi.fn(),
    createClient: vi.fn(),
    extractIPFromHeaders: vi.fn(),
    extractUserAgentFromHeaders: vi.fn(),
    logAbuseEvent: vi.fn(),
    prepareNormalAuthRecoveryOverrideUse: vi.fn(),
    recordPasswordLoginFailure: vi.fn(),
    resolveTurnstileToken: vi.fn(),
    shouldBypassSupabaseAuthCaptchaForDev: vi.fn(),
    validateEmail: vi.fn(),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/turnstile/server', () => ({
  isTurnstileError: vi.fn(() => false),
  resolveTurnstileToken: (
    ...args: Parameters<typeof mocks.resolveTurnstileToken>
  ) => mocks.resolveTurnstileToken(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  checkPasswordLoginLimit: (
    ...args: Parameters<typeof mocks.checkPasswordLoginLimit>
  ) => mocks.checkPasswordLoginLimit(...args),
  classifyPotentialSpamUserAgent: (
    ...args: Parameters<typeof mocks.classifyPotentialSpamUserAgent>
  ) => mocks.classifyPotentialSpamUserAgent(...args),
  clearPasswordLoginFailures: (
    ...args: Parameters<typeof mocks.clearPasswordLoginFailures>
  ) => mocks.clearPasswordLoginFailures(...args),
  extractIPFromHeaders: (
    ...args: Parameters<typeof mocks.extractIPFromHeaders>
  ) => mocks.extractIPFromHeaders(...args),
  extractUserAgentFromHeaders: (
    ...args: Parameters<typeof mocks.extractUserAgentFromHeaders>
  ) => mocks.extractUserAgentFromHeaders(...args),
  logAbuseEvent: (...args: Parameters<typeof mocks.logAbuseEvent>) =>
    mocks.logAbuseEvent(...args),
  recordPasswordLoginFailure: (
    ...args: Parameters<typeof mocks.recordPasswordLoginFailure>
  ) => mocks.recordPasswordLoginFailure(...args),
}));

vi.mock('@tuturuuu/utils/email/server', () => ({
  validateEmail: (...args: Parameters<typeof mocks.validateEmail>) =>
    mocks.validateEmail(...args),
}));

vi.mock('@/lib/auth/local-e2e', () => ({
  shouldBypassSupabaseAuthCaptchaForDev: (
    ...args: Parameters<typeof mocks.shouldBypassSupabaseAuthCaptchaForDev>
  ) => mocks.shouldBypassSupabaseAuthCaptchaForDev(...args),
}));

vi.mock('@/lib/auth/recovery', () => ({
  prepareNormalAuthRecoveryOverrideUse: (
    ...args: Parameters<typeof mocks.prepareNormalAuthRecoveryOverrideUse>
  ) => mocks.prepareNormalAuthRecoveryOverrideUse(...args),
}));

describe('passwordLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.extractIPFromHeaders.mockReturnValue('1.2.3.4');
    mocks.extractUserAgentFromHeaders.mockReturnValue(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36'
    );
    mocks.classifyPotentialSpamUserAgent.mockReturnValue({
      matchedPattern: null,
      normalizedUserAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36',
      reason: null,
      riskLevel: 'allow',
    });
    mocks.checkPasswordLoginLimit.mockResolvedValue({
      allowed: true,
      remainingAttempts: 5,
    });
    mocks.validateEmail.mockResolvedValue('person@example.com');
    mocks.resolveTurnstileToken.mockReturnValue({
      captchaOptions: {},
      shouldBypassForDev: true,
    });
    mocks.shouldBypassSupabaseAuthCaptchaForDev.mockReturnValue(true);
    mocks.createClient.mockResolvedValue(mocks.browserClient);
    mocks.createAdminClient.mockResolvedValue(mocks.adminClient);
    mocks.prepareNormalAuthRecoveryOverrideUse.mockResolvedValue(null);
    mocks.browserSignInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'access',
          expires_at: 123,
          expires_in: 3600,
          refresh_token: 'refresh',
          token_type: 'bearer',
        },
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.adminUpdateUserById.mockResolvedValue({ error: null });
  });

  it('uses the request client for web password login even when dev captcha bypass is active', async () => {
    const { passwordLogin } = await import('./password');

    const result = await passwordLogin(
      {
        client: 'web',
        email: 'person@example.com',
        locale: 'en',
        password: 'password123',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/password-login',
        headers: new Headers(),
      }
    );

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.resolveTurnstileToken).toHaveBeenCalledWith({
      devMode: true,
      token: undefined,
      requireConfiguration: true,
    });
    expect(mocks.browserSignInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: {},
      password: 'password123',
    });
    expect(result).toEqual({
      body: { success: true },
      status: 200,
    });
    expect(mocks.checkPasswordLoginLimit).toHaveBeenNthCalledWith(
      1,
      '1.2.3.4',
      {
        route: '/api/v1/auth/password-login',
        source: 'password-login',
      }
    );
    expect(mocks.checkPasswordLoginLimit).toHaveBeenNthCalledWith(
      2,
      '1.2.3.4',
      'person@example.com',
      {
        route: '/api/v1/auth/password-login',
        source: 'password-login',
      }
    );
    expect(mocks.clearPasswordLoginFailures).toHaveBeenCalledWith(
      '1.2.3.4',
      'person@example.com'
    );
  });

  it('requires a Turnstile token for hosted Supabase password login in development', async () => {
    const { passwordLogin } = await import('./password');

    mocks.shouldBypassSupabaseAuthCaptchaForDev.mockReturnValue(false);
    mocks.resolveTurnstileToken.mockReturnValue({
      captchaOptions: { captchaToken: 'captcha-token' },
      shouldBypassForDev: false,
    });

    await passwordLogin(
      {
        captchaToken: 'captcha-token',
        client: 'web',
        email: 'person@example.com',
        locale: 'en',
        password: 'password123',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/password-login',
        headers: new Headers(),
      }
    );

    expect(mocks.resolveTurnstileToken).toHaveBeenCalledWith({
      devMode: false,
      token: 'captcha-token',
      requireConfiguration: true,
    });
    expect(mocks.browserSignInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: { captchaToken: 'captcha-token' },
      password: 'password123',
    });
  });

  it('surfaces Supabase captcha failures without recording a password failure', async () => {
    const { passwordLogin } = await import('./password');

    mocks.shouldBypassSupabaseAuthCaptchaForDev.mockReturnValue(false);
    mocks.resolveTurnstileToken.mockReturnValue({
      captchaOptions: {},
      shouldBypassForDev: false,
    });
    mocks.browserSignInWithPassword.mockResolvedValue({
      data: {
        session: null,
        user: null,
      },
      error: {
        message:
          'captcha protection: request disallowed (no captcha_token found)',
      },
    });

    const result = await passwordLogin(
      {
        client: 'web',
        email: 'person@example.com',
        locale: 'en',
        password: 'password123',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/password-login',
        headers: new Headers(),
      }
    );

    expect(result).toEqual({
      body: {
        error:
          'captcha protection: request disallowed (no captcha_token found)',
      },
      status: 400,
    });
    expect(mocks.recordPasswordLoginFailure).not.toHaveBeenCalled();
  });

  it('uses an active auth recovery override to skip email-scoped password throttling while wrong passwords still fail', async () => {
    const { passwordLogin } = await import('./password');

    mocks.prepareNormalAuthRecoveryOverrideUse.mockResolvedValue({
      allowNormalLogin: true,
      allowRecoveryEmail: true,
      email: 'person@example.com',
      id: 'override-1',
    });
    mocks.browserSignInWithPassword.mockResolvedValue({
      data: {
        session: null,
        user: null,
      },
      error: {
        message: 'Invalid login credentials',
      },
    });

    const result = await passwordLogin(
      {
        client: 'web',
        email: 'person@example.com',
        locale: 'en',
        password: 'wrong-password',
      },
      {
        client: 'web',
        endpoint: '/api/v1/auth/password-login',
        headers: new Headers(),
      }
    );

    expect(result).toEqual({
      body: {
        error: 'Invalid login credentials',
        remainingAttempts: 4,
      },
      status: 401,
    });
    expect(mocks.checkPasswordLoginLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkPasswordLoginLimit).toHaveBeenCalledWith('1.2.3.4', {
      route: '/api/v1/auth/password-login',
      source: 'password-login',
    });
    expect(mocks.recordPasswordLoginFailure).toHaveBeenCalledWith(
      '1.2.3.4',
      undefined
    );
  });
});
