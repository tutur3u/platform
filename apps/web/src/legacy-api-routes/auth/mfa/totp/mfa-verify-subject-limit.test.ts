import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  challengeAndVerify: vi.fn(),
  checkMFAVerifyLimit: vi.fn(),
  clearMFAVerifyFailures: vi.fn(),
  clearMFAVerifySubjectFailures: vi.fn(),
  createClient: vi.fn(),
  recordMFAVerifyFailure: vi.fn(),
  reserveMFAVerifySubjectAttempt: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  checkMFAVerifyLimit: mocks.checkMFAVerifyLimit,
  clearMFAVerifyFailures: mocks.clearMFAVerifyFailures,
  extractIPFromHeaders: () => '203.0.113.10',
  recordMFAVerifyFailure: mocks.recordMFAVerifyFailure,
}));

vi.mock('@tuturuuu/utils/abuse-protection/mfa-subject-limits', () => ({
  clearMFAVerifySubjectFailures: mocks.clearMFAVerifySubjectFailures,
  reserveMFAVerifySubjectAttempt: mocks.reserveMFAVerifySubjectAttempt,
}));

import { POST as verifyChallenge } from './challenge/verify/route';
import { POST as verifyFactor } from './factors/[factorId]/verify/route';

const USER_ID = '00000000-0000-4000-8000-00000000000a';
const FACTOR_ID = '00000000-0000-4000-8000-0000000000f1';
const subject = { userId: USER_ID, factorId: FACTOR_ID };

const routes = [
  {
    name: 'challenge verify',
    call: () =>
      verifyChallenge(
        new Request('http://localhost/api/auth/mfa/totp/challenge/verify', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: 'challenge-1',
            factorId: FACTOR_ID,
            code: '123456',
          }),
        })
      ),
    authCall: () => mocks.verify,
  },
  {
    name: 'factor verify',
    call: () =>
      verifyFactor(
        new Request(
          `http://localhost/api/auth/mfa/totp/factors/${FACTOR_ID}/verify`,
          { method: 'POST', body: JSON.stringify({ code: '123456' }) }
        ),
        { params: Promise.resolve({ factorId: FACTOR_ID }) }
      ),
    authCall: () => mocks.challengeAndVerify,
  },
] as const;

describe.each(routes)('MFA $name per-account limit', ({ call, authCall }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkMFAVerifyLimit.mockResolvedValue({ allowed: true });
    mocks.reserveMFAVerifySubjectAttempt.mockResolvedValue({ allowed: true });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: USER_ID },
      authError: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: {
        mfa: {
          challengeAndVerify: mocks.challengeAndVerify,
          verify: mocks.verify,
        },
      },
    });
  });

  it('rejects before contacting Auth when the account budget is spent', async () => {
    mocks.reserveMFAVerifySubjectAttempt.mockResolvedValue({
      allowed: false,
      reason: 'Too many failed MFA verification attempts',
      retryAfter: 600,
    });

    const response = await call();

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ retryAfter: 600 });
    expect(mocks.reserveMFAVerifySubjectAttempt).toHaveBeenCalledWith(subject);
    expect(authCall()).not.toHaveBeenCalled();
  });

  it('keeps the reserved attempt when the code is wrong', async () => {
    authCall().mockResolvedValue({
      data: null,
      error: { message: 'Invalid TOTP code entered' },
    });

    const response = await call();

    expect(response.status).toBe(400);
    expect(mocks.reserveMFAVerifySubjectAttempt).toHaveBeenCalledWith(subject);
    expect(mocks.clearMFAVerifySubjectFailures).not.toHaveBeenCalled();
  });

  it('clears the account budget after a valid code', async () => {
    authCall().mockResolvedValue({ data: { ok: true }, error: null });

    const response = await call();

    expect(response.status).toBe(200);
    expect(mocks.clearMFAVerifySubjectFailures).toHaveBeenCalledWith(subject);
  });
});
