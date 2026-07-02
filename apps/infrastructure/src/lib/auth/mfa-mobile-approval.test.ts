import { MFA_MOBILE_APPROVAL_KIND } from '@tuturuuu/auth/mfa-mobile-approval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminClient: {
    from: vi.fn(),
  },
  checkRateLimit: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  userClient: {
    auth: {
      getClaims: vi.fn(),
      getUser: vi.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn(),
      },
    },
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: Parameters<typeof mocks.checkRateLimit>) =>
    mocks.checkRateLimit(...args),
}));

function createBuilder<T>(value: T, error: unknown = null) {
  const builder = {
    eq: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    is: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data: value, error }),
    select: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data: value, error }),
    update: vi.fn(() => builder),
  };

  return builder;
}

function createChallengeRow(overrides: Record<string, unknown> = {}) {
  return {
    approval_metadata: {},
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    id: 'challenge-1',
    request_metadata: { kind: MFA_MOBILE_APPROVAL_KIND },
    status: 'approved',
    ...overrides,
  };
}

describe('mobile MFA approval helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createAdminClient.mockResolvedValue(mocks.adminClient);
    mocks.createClient.mockResolvedValue(mocks.userClient);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} });
    mocks.userClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'person@example.com',
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.userClient.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    mocks.userClient.auth.getClaims.mockResolvedValue({
      data: { claims: { session_id: 'session-1', sub: 'user-1' } },
      error: null,
    });
    mocks.adminClient.from.mockReset();
  });

  it('binds a consumed mobile MFA approval to the current Supabase session', async () => {
    const { pollMfaMobileApprovalChallenge } = await import(
      './mfa-mobile-approval'
    );
    const row = createChallengeRow({
      approval_metadata: { approvedBy: 'mobile' },
      status: 'approved',
    });
    const loadBuilder = createBuilder(row);
    const updateBuilder = createBuilder({ ...row, status: 'consumed' });

    mocks.adminClient.from
      .mockReturnValueOnce(loadBuilder)
      .mockReturnValueOnce(updateBuilder);

    const result = await pollMfaMobileApprovalChallenge(
      {
        challengeId: 'challenge-1',
        secret: 'secret-value-1234',
      },
      {
        endpoint: '/api/v1/auth/mfa/mobile/challenges/[challengeId]',
        headers: new Headers(),
        request: {
          headers: new Headers(),
          url: 'https://tuturuuu.com/api/v1/auth/mfa/mobile/challenges/challenge-1',
        },
      }
    );

    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        approval_metadata: expect.objectContaining({
          approvedBy: 'mobile',
          approverSessionId: 'session-1',
          mobileMfaSessionTtlSeconds: 43_200,
          mobileMfaValidUntil: expect.any(String),
        }),
        status: 'consumed',
      })
    );
    expect(result).toMatchObject({
      body: {
        mobileMfaVerified: true,
        status: 'approved',
        success: true,
      },
      cookie: {
        name: 'ttr_mfa_mobile_approval',
        value: 'challenge-1.secret-value-1234',
      },
      status: 200,
    });
  });

  it('does not reissue a consumed approval cookie for a different Supabase session', async () => {
    const { pollMfaMobileApprovalChallenge } = await import(
      './mfa-mobile-approval'
    );
    const row = createChallengeRow({
      approval_metadata: {
        approverSessionId: 'session-1',
        mobileMfaValidUntil: new Date(Date.now() + 60_000).toISOString(),
      },
      status: 'consumed',
    });
    const loadBuilder = createBuilder(row);

    mocks.userClient.auth.getClaims.mockResolvedValue({
      data: { claims: { session_id: 'session-2', sub: 'user-1' } },
      error: null,
    });
    mocks.adminClient.from.mockReturnValueOnce(loadBuilder);

    const result = await pollMfaMobileApprovalChallenge(
      {
        challengeId: 'challenge-1',
        secret: 'secret-value-1234',
      },
      {
        endpoint: '/api/v1/auth/mfa/mobile/challenges/[challengeId]',
        headers: new Headers(),
        request: {
          headers: new Headers(),
          url: 'https://tuturuuu.com/api/v1/auth/mfa/mobile/challenges/challenge-1',
        },
      }
    );

    expect(result).toEqual({
      body: {
        mobileMfaVerified: false,
        status: 'consumed',
        success: false,
        validUntil: null,
      },
      cookie: undefined,
      status: 200,
    });
  });
});
