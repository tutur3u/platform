import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Every dependency behind the fence fails the test if it is reached: a
// refused browser request must not touch rate limits, credentials or OTPs.
const unreachable = vi.hoisted(
  () => (name: string) =>
    vi.fn(() => {
      throw new Error(`${name} must not run for a refused browser request`);
    })
);

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: unreachable('createAdminClient'),
  createClient: unreachable('createClient'),
  createDetachedClient: unreachable('createDetachedClient'),
}));

vi.mock('@tuturuuu/turnstile/server', () => ({
  isTurnstileError: vi.fn(() => false),
  resolveTurnstileToken: unreachable('resolveTurnstileToken'),
  verifyTurnstileToken: unreachable('verifyTurnstileToken'),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  checkOTPSendAllowed: unreachable('checkOTPSendAllowed'),
  checkOTPVerifyLimit: unreachable('checkOTPVerifyLimit'),
  checkPasswordLoginLimit: unreachable('checkPasswordLoginLimit'),
  classifyPotentialSpamUserAgent: unreachable('classifyPotentialSpamUserAgent'),
  clearOTPVerifyFailures: unreachable('clearOTPVerifyFailures'),
  clearPasswordLoginFailures: unreachable('clearPasswordLoginFailures'),
  extractIPFromHeaders: vi.fn(() => '203.0.113.7'),
  extractUserAgentFromHeaders: unreachable('extractUserAgentFromHeaders'),
  logAbuseEvent: unreachable('logAbuseEvent'),
  recordOTPSendSuccess: unreachable('recordOTPSendSuccess'),
  recordOTPVerifyFailure: unreachable('recordOTPVerifyFailure'),
  recordPasswordLoginFailure: unreachable('recordPasswordLoginFailure'),
}));

vi.mock('@tuturuuu/utils/email/server', () => ({
  checkEmailInfrastructureBlocked: unreachable(
    'checkEmailInfrastructureBlocked'
  ),
  checkIfUserExists: unreachable('checkIfUserExists'),
  generateRandomPassword: unreachable('generateRandomPassword'),
  validateEmail: unreachable('validateEmail'),
  validateOtp: unreachable('validateOtp'),
}));

vi.mock('@/lib/mobile-version-policy', () => ({
  getMobileVersionPolicies: unreachable('getMobileVersionPolicies'),
  getWebOtpEnabledConfig: unreachable('getWebOtpEnabledConfig'),
}));

vi.mock('@/lib/auth/recovery', () => ({
  prepareNormalAuthRecoveryOverrideUse: unreachable(
    'prepareNormalAuthRecoveryOverrideUse'
  ),
}));

vi.mock('@/lib/auth/local-e2e', () => ({
  shouldBypassSupabaseAuthCaptchaForDev: vi.fn(() => false),
}));

const passwordBody = {
  email: 'person@example.com',
  password: 'correct-horse',
};
const otpBody = {
  email: 'person@example.com',
  otp: '123456',
  platform: 'ios',
};

const routes = [
  {
    body: passwordBody,
    load: () => import('@/app/api/v1/auth/mobile/password-login/route'),
    path: '/api/v1/auth/mobile/password-login',
  },
  {
    body: otpBody,
    load: () => import('@/app/api/v1/auth/mobile/verify-otp/route'),
    path: '/api/v1/auth/mobile/verify-otp',
  },
  {
    body: { ...passwordBody, client: 'mobile' },
    load: () => import('@/app/api/v1/auth/password-login/route'),
    path: '/api/v1/auth/password-login',
  },
  {
    body: { ...otpBody, client: 'mobile' },
    load: () => import('@/app/api/v1/auth/otp/verify/route'),
    path: '/api/v1/auth/otp/verify',
  },
];

const browserHeaders = [
  ['an apex Origin', { origin: 'https://tuturuuu.com' }],
  ['a sibling-subdomain Origin', { origin: 'https://meet.tuturuuu.com' }],
  [
    'Fetch Metadata',
    { 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin' },
  ],
] as const;

describe('mobile session token routes refuse browser requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  for (const route of routes) {
    it.each(browserHeaders)(
      `${route.path} refuses %s`,
      async (_label, headers) => {
        const { POST } = await route.load();

        const response = await POST(
          new NextRequest(`https://tuturuuu.com${route.path}`, {
            body: JSON.stringify(route.body),
            headers: { 'content-type': 'application/json', ...headers },
            method: 'POST',
          })
        );
        const body = await response.json();

        expect(response.status).toBe(403);
        expect(body).toMatchObject({ code: 'MOBILE_SESSION_BROWSER_REFUSED' });
        expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/u);
      }
    );
  }
});
