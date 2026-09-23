vi.mock('./device-mfa/registry', () => ({
  isTrustedAuthenticator: vi.fn().mockResolvedValue(true),
}));

import { MFA_MOBILE_APPROVAL_KIND } from '@tuturuuu/auth/mfa-mobile-approval';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assurance: vi.fn(),
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

vi.mock('@tuturuuu/utils/required-mfa-supabase-session', () => ({
  resolveVerifiedSupabaseMfa: mocks.assurance,
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

vi.mock('./mfa-approval-push', () => ({ sendMfaApprovalPush: vi.fn() }));

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
    mocks.assurance.mockResolvedValue({ status: 'allowed', proof: null });

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

const context = {
  endpoint: '/api/v1/auth/mfa/mobile/challenges/test',
  headers: new Headers(),
};

describe('number matching and request lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assurance.mockResolvedValue({ status: 'allowed', proof: null });
    mocks.createAdminClient.mockResolvedValue(mocks.adminClient);
    mocks.createClient.mockResolvedValue(mocks.userClient);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.userClient.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'person@example.com' } },
      error: null,
    });
    mocks.userClient.auth.getClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', session_id: 'mobile-session' } },
      error: null,
    });
    mocks.userClient.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    });
    mocks.adminClient.from.mockReset();
  });
  it('cannot use pre-recovery AAL2 to approve a fresh browser challenge', async () => {
    const { approveMfaMobileApprovalChallenge } = await import(
      './mfa-mobile-approval'
    );
    mocks.assurance.mockResolvedValue({ status: 'required', userId: 'user-1' });
    const now = Math.floor(Date.now() / 1000);
    mocks.userClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: {
            tuturuuu_required_mfa: { required: true, verifiedAfter: now - 5 },
          },
        },
      },
      error: null,
    });
    mocks.userClient.auth.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: 'user-1',
          session_id: 'mobile-session',
          aal: 'aal2',
          amr: [{ method: 'totp', timestamp: now - 30 }],
        },
      },
      error: null,
    });
    const result = await approveMfaMobileApprovalChallenge(
      { challengeId: 'challenge-1', pairCode: '123456' },
      context
    );
    expect(result.status).toBe(403);
    expect(result.body.code).toBe('MFA_REQUIRED');
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '999999'])(
    'refuses missing or incorrect number %s',
    async (pairCode) => {
      const { approveMfaMobileApprovalChallenge } = await import(
        './mfa-mobile-approval'
      );
      const row = createChallengeRow({
        status: 'pending',
        request_metadata: {
          kind: MFA_MOBILE_APPROVAL_KIND,
          pairCode: '123456',
          requesterSessionId: 'desktop-session',
        },
      });
      const builder = createBuilder(row);
      mocks.adminClient.from.mockReturnValue(builder);
      const result = await approveMfaMobileApprovalChallenge(
        { challengeId: 'challenge-1', pairCode },
        context
      );
      expect(result.status).toBe(400);
      expect(builder.update).not.toHaveBeenCalled();
    }
  );
  it('persists a denial without consuming or approving the challenge', async () => {
    const { approveMfaMobileApprovalChallenge } = await import(
      './mfa-mobile-approval'
    );
    const row = createChallengeRow({
      status: 'pending',
      request_metadata: { kind: MFA_MOBILE_APPROVAL_KIND, pairCode: '123456' },
    });
    const load = createBuilder(row);
    const update = createBuilder({ ...row, status: 'rejected' });
    mocks.adminClient.from
      .mockReturnValueOnce(load)
      .mockReturnValueOnce(update);
    const result = await approveMfaMobileApprovalChallenge(
      { challengeId: 'challenge-1', decision: 'reject' },
      context
    );
    expect(result.body.status).toBe('rejected');
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' })
    );
  });
  it('rejects a poll from another session of the same account', async () => {
    const { pollMfaMobileApprovalChallenge } = await import(
      './mfa-mobile-approval'
    );
    const load = createBuilder(
      createChallengeRow({
        request_metadata: {
          kind: MFA_MOBILE_APPROVAL_KIND,
          requesterSessionId: 'desktop-session',
        },
      })
    );
    mocks.adminClient.from.mockReturnValue(load);
    const result = await pollMfaMobileApprovalChallenge(
      { challengeId: 'challenge-1', secret: 'request-secret' },
      context
    );
    expect(result.status).toBe(404);
    expect(load.update).not.toHaveBeenCalled();
  });
  it('does not consume an approval after its original deadline', async () => {
    const { pollMfaMobileApprovalChallenge } = await import(
      './mfa-mobile-approval'
    );
    const load = createBuilder(
      createChallengeRow({ expires_at: '2000-01-01T00:00:00Z' })
    );
    mocks.adminClient.from.mockReturnValue(load);
    const result = await pollMfaMobileApprovalChallenge(
      { challengeId: 'challenge-1', secret: 'request-secret' },
      context
    );
    expect(result.body.status).toBe('expired');
    expect(load.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'consumed' })
    );
  });
  it('never sends the matching number to the approving device', async () => {
    const { listPendingMfaMobileApprovals } = await import(
      './mfa-mobile-approval'
    );
    const row = createChallengeRow({
      request_metadata: {
        kind: MFA_MOBILE_APPROVAL_KIND,
        pairCode: '123456',
        userAgent: 'Browser',
      },
      status: 'pending',
    });
    const builder = {
      ...createBuilder([row]),
      contains: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [row], error: null }),
    };
    builder.contains.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.select.mockReturnValue(builder as never);
    builder.eq.mockReturnValue(builder as never);
    builder.gt.mockReturnValue(builder as never);
    mocks.adminClient.from.mockReturnValue(builder);
    const result = await listPendingMfaMobileApprovals(context);
    expect(result.body.approvals).toEqual([
      expect.objectContaining({ numberMatching: true, browser: 'Browser' }),
    ]);
    expect(JSON.stringify(result.body)).not.toContain('123456');
  });
});
