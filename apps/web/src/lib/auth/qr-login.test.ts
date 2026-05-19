import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminClient: {
    auth: {
      admin: {
        generateLink: vi.fn(),
        getUserById: vi.fn(),
      },
    },
    from: vi.fn(),
  },
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createDetachedClient: vi.fn(),
  detachedClient: {
    auth: {
      verifyOtp: vi.fn(),
    },
  },
  serverLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  verifyTurnstileToken: vi.fn(),
  userClient: {
    auth: {
      getUser: vi.fn(),
    },
  },
  checkRateLimit: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
  createDetachedClient: (
    ...args: Parameters<typeof mocks.createDetachedClient>
  ) => mocks.createDetachedClient(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: Parameters<typeof mocks.checkRateLimit>) =>
    mocks.checkRateLimit(...args),
}));

vi.mock('@tuturuuu/turnstile/server', () => ({
  isTurnstileError: (error: unknown) =>
    error instanceof Error && error.name === 'TurnstileError',
  verifyTurnstileToken: (
    ...args: Parameters<typeof mocks.verifyTurnstileToken>
  ) => mocks.verifyTurnstileToken(...args),
}));

function createMaybeSingleBuilder<T>(value: T, error: unknown = null) {
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

describe('QR login helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createAdminClient.mockResolvedValue(mocks.adminClient);
    mocks.createClient.mockResolvedValue(mocks.userClient);
    mocks.createDetachedClient.mockReturnValue(mocks.detachedClient);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, headers: {} });
    mocks.verifyTurnstileToken.mockResolvedValue(undefined);
    mocks.adminClient.from.mockReset();
    mocks.userClient.auth.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'approver@example.com',
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.adminClient.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'person@example.com', id: 'user-1' } },
      error: null,
    });
    mocks.adminClient.auth.admin.generateLink.mockResolvedValue({
      data: {
        properties: {
          action_link: 'https://tuturuuu.com/auth/confirm?token=token-hash',
        },
      },
      error: null,
    });
    mocks.detachedClient.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          expires_at: 123,
          expires_in: 3600,
          refresh_token: 'refresh-token',
          token_type: 'bearer',
        },
      },
      error: null,
    });
  });

  it('hashes QR secrets before persistence', async () => {
    const { hashQrLoginSecret } = await import('./qr-login');

    expect(hashQrLoginSecret('secret-value')).toBe(
      '31160254d1297393d2ad00e1c01851aec834361e02c524b89fe06aff2879ce6a'
    );
  });

  it('builds a Tuturuuu QR login payload with challenge metadata', async () => {
    const { buildQrLoginPayload } = await import('./qr-login');

    const payload = buildQrLoginPayload({
      challengeId: '00000000-0000-4000-8000-000000000001',
      origin: 'https://tuturuuu.com',
      secret: 'secret-token',
    });

    expect(payload).toBe(
      'tuturuuu://auth/qr-login?challengeId=00000000-0000-4000-8000-000000000001&secret=secret-token&origin=https%3A%2F%2Ftuturuuu.com'
    );
  });

  it('creates QR challenges for trusted web origins only', async () => {
    const { createQrLoginChallenge } = await import('./qr-login');
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const insertBuilder = createMaybeSingleBuilder({
      expires_at: expiresAt,
      id: 'challenge-1',
      status: 'pending',
    });
    mocks.adminClient.from.mockReturnValue(insertBuilder);

    const result = await createQrLoginChallenge(
      {
        captchaToken: 'captcha-token',
        locale: 'en',
        origin: 'https://tuturuuu.com',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges',
        headers: new Headers(),
        request: {
          headers: new Headers(),
          url: 'https://tuturuuu.com/login',
        },
      }
    );

    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.any(Headers) }),
      'captcha-token'
    );
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        expires_at: expect.any(String),
        request_metadata: expect.objectContaining({
          creatorUserId: 'user-1',
          origin: 'https://tuturuuu.com',
        }),
        status: 'pending',
      })
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      challenge: {
        expiresAt,
        id: 'challenge-1',
        status: 'pending',
      },
      expiresIn: 120,
      success: true,
    });
  });

  it('requires authentication before creating QR challenges', async () => {
    const { createQrLoginChallenge } = await import('./qr-login');
    mocks.userClient.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const result = await createQrLoginChallenge(
      {
        origin: 'https://tuturuuu.com',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges',
        headers: new Headers(),
        request: {
          headers: new Headers(),
          url: 'https://tuturuuu.com/login',
        },
      }
    );

    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
    expect(result).toEqual({
      body: { error: 'Authentication required' },
      status: 401,
    });
  });

  it('requires Turnstile verification before creating QR challenges', async () => {
    const { createQrLoginChallenge } = await import('./qr-login');
    const error = new Error('Turnstile verification is required');
    error.name = 'TurnstileError';
    mocks.verifyTurnstileToken.mockRejectedValue(error);

    const result = await createQrLoginChallenge(
      {
        locale: 'en',
        origin: 'https://tuturuuu.com',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges',
        headers: new Headers(),
        request: {
          headers: new Headers(),
          url: 'https://tuturuuu.com/login',
        },
      }
    );

    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.any(Headers) }),
      undefined
    );
    expect(mocks.adminClient.from).not.toHaveBeenCalled();
    expect(result).toEqual({
      body: { error: 'Turnstile verification is required' },
      status: 400,
    });
  });

  it('rejects QR challenges for untrusted web origins', async () => {
    const { createQrLoginChallenge } = await import('./qr-login');

    const result = await createQrLoginChallenge(
      {
        origin: 'https://evil.example',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges',
        headers: new Headers(),
        request: {
          headers: new Headers(),
          url: 'https://tuturuuu.com/login',
        },
      }
    );

    expect(mocks.adminClient.from).not.toHaveBeenCalled();
    expect(result).toEqual({
      body: {
        error: 'QR login is only available from a trusted Tuturuuu web origin.',
      },
      status: 400,
    });
  });

  it('creates a fresh detached session without storing session tokens', async () => {
    const { issueQrLoginSessionForUser } = await import('./qr-login');

    const session = await issueQrLoginSessionForUser('user-1');

    expect(mocks.adminClient.auth.admin.generateLink).toHaveBeenCalledWith({
      email: 'person@example.com',
      options: {
        data: {
          auth_client: 'qr_login',
          origin: 'TUTURUUU_WEB_QR',
        },
      },
      type: 'magiclink',
    });
    expect(mocks.detachedClient.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'token-hash',
      type: 'magiclink',
    });
    expect(session).toEqual({
      access_token: 'access-token',
      expires_at: 123,
      expires_in: 3600,
      refresh_token: 'refresh-token',
      token_type: 'bearer',
    });
  });

  it('returns invalid challenge for a wrong QR secret', async () => {
    const { pollQrLoginChallenge } = await import('./qr-login');
    mocks.adminClient.from.mockReturnValue(createMaybeSingleBuilder(null));

    const result = await pollQrLoginChallenge(
      {
        challengeId: 'challenge-1',
        secret: 'wrong-secret',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges/[challengeId]',
        headers: new Headers(),
      }
    );

    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: 'Invalid or expired QR login request.',
    });
  });

  it('marks expired pending challenges without issuing a session', async () => {
    const { pollQrLoginChallenge } = await import('./qr-login');
    const expired = {
      approval_metadata: {},
      approved_at: null,
      approver_device_id: null,
      approver_email: null,
      approver_platform: null,
      approver_user_id: null,
      consumed_at: null,
      created_at: new Date(Date.now() - 180_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      id: 'challenge-1',
      request_metadata: {},
      secret_hash: 'hash',
      status: 'pending',
      updated_at: new Date(Date.now() - 180_000).toISOString(),
    };
    const loadBuilder = createMaybeSingleBuilder(expired);
    const updateBuilder = createMaybeSingleBuilder({
      ...expired,
      status: 'expired',
    });
    mocks.adminClient.from
      .mockReturnValueOnce(loadBuilder)
      .mockReturnValueOnce(updateBuilder);

    const result = await pollQrLoginChallenge(
      {
        challengeId: 'challenge-1',
        secret: 'secret-token',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges/[challengeId]',
        headers: new Headers(),
      }
    );

    expect(updateBuilder.update).toHaveBeenCalledWith({ status: 'expired' });
    expect(mocks.adminClient.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(result.body).toMatchObject({
      status: 'expired',
      success: false,
    });
  });

  it('records authenticated approval for pending challenges', async () => {
    const { approveQrLoginChallenge } = await import('./qr-login');
    const pending = {
      approval_metadata: {},
      approved_at: null,
      approver_device_id: null,
      approver_email: null,
      approver_platform: null,
      approver_user_id: null,
      consumed_at: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      id: 'challenge-1',
      request_metadata: { creatorUserId: 'user-1' },
      secret_hash: 'hash',
      status: 'pending',
      updated_at: new Date().toISOString(),
    };
    const loadBuilder = createMaybeSingleBuilder(pending);
    const updateBuilder = createMaybeSingleBuilder({
      expires_at: pending.expires_at,
      id: pending.id,
      status: 'approved',
    });
    mocks.adminClient.from
      .mockReturnValueOnce(loadBuilder)
      .mockReturnValueOnce(updateBuilder);

    const result = await approveQrLoginChallenge(
      {
        challengeId: 'challenge-1',
        deviceId: 'device-1',
        platform: 'ios',
        secret: 'secret-token',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges/[challengeId]/approve',
        headers: new Headers(),
      }
    );

    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        approver_device_id: 'device-1',
        approver_email: 'approver@example.com',
        approver_platform: 'ios',
        approver_user_id: 'user-1',
        status: 'approved',
      })
    );
    expect(result.body).toMatchObject({
      status: 'approved',
      success: true,
    });
  });

  it('rejects approvals when approver is not the challenge creator', async () => {
    const { approveQrLoginChallenge } = await import('./qr-login');
    const pending = {
      approval_metadata: {},
      approved_at: null,
      approver_device_id: null,
      approver_email: null,
      approver_platform: null,
      approver_user_id: null,
      consumed_at: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      id: 'challenge-1',
      request_metadata: { creatorUserId: 'attacker-user' },
      secret_hash: 'hash',
      status: 'pending',
      updated_at: new Date().toISOString(),
    };
    const loadBuilder = createMaybeSingleBuilder(pending);
    mocks.adminClient.from.mockReturnValueOnce(loadBuilder);

    const result = await approveQrLoginChallenge(
      {
        challengeId: 'challenge-1',
        secret: 'secret-token',
      },
      {
        endpoint: '/api/v1/auth/qr-login/challenges/[challengeId]/approve',
        headers: new Headers(),
      }
    );

    expect(mocks.adminClient.from).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      body: { error: 'Invalid or expired QR login request.' },
      status: 403,
    });
  });
});
