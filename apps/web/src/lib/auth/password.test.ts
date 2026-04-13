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
    recordPasswordLoginFailure: vi.fn(),
    resolveTurnstileToken: vi.fn(),
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
    mocks.createClient.mockResolvedValue(mocks.browserClient);
    mocks.createAdminClient.mockResolvedValue(mocks.adminClient);
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
        endpoint: '/login/actions/password-login',
        headers: new Headers(),
      }
    );

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.browserSignInWithPassword).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: {},
      password: 'password123',
    });
    expect(result).toEqual({
      body: { success: true },
      status: 200,
    });
  });
});
