import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  defaultTrustMultiplierForTier: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  recordSignal: vi.fn(),
  select: vi.fn(),
  serverLoggerError: vi.fn(),
  single: vi.fn(),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  ABUSE_REPUTATION_SUBJECT_TYPES: [
    'user',
    'session',
    'api_key',
    'ip',
    'cidr',
    'user_location',
  ],
  ABUSE_RISK_TIERS: [
    'trusted',
    'standard',
    'watch',
    'challenge_required',
    'restricted',
  ],
  recordAbuseActivitySignal: (input: unknown) => mocks.recordSignal(input),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
  },
}));

vi.mock('./_shared', () => ({
  authorizeAbuseIntelligenceRequest: (...args: unknown[]) =>
    mocks.authorize(...args),
  defaultTrustMultiplierForTier: (tier: string) =>
    mocks.defaultTrustMultiplierForTier(tier),
}));

import { POST } from './route';

describe('abuse intelligence route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.defaultTrustMultiplierForTier.mockReturnValue(3);
    mocks.from.mockReturnValue({
      insert: mocks.insert,
    });
    mocks.insert.mockReturnValue({
      select: mocks.select,
    });
    mocks.select.mockReturnValue({
      single: mocks.single,
    });
    mocks.single.mockResolvedValue({
      data: {
        id: 'override-1',
        subject_key: 'user:user-1',
        subject_type: 'user',
        tier: 'trusted',
      },
      error: null,
    });
  });

  it('requires override management permission', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await POST(
      new Request('http://localhost/api/v1/infrastructure/abuse-intelligence', {
        body: JSON.stringify({
          reason: 'Verified organic operator',
          subjectKey: 'user:user-1',
          subjectType: 'user',
          tier: 'trusted',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.any(Request),
      'manage_workspace_roles'
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('creates audited manual overrides for root admins', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      supabase: {
        from: mocks.from,
      },
      user: {
        id: 'admin-1',
      },
    });

    const response = await POST(
      new Request('http://localhost/api/v1/infrastructure/abuse-intelligence', {
        body: JSON.stringify({
          reason: 'Verified organic operator',
          subjectKey: 'user:user-1',
          subjectType: 'user',
          tier: 'trusted',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('abuse_trust_overrides');
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: 'admin-1',
        reason: 'Verified organic operator',
        subject_key: 'user:user-1',
        subject_type: 'user',
        tier: 'trusted',
        trust_multiplier: 3,
      })
    );
    expect(mocks.recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'manual_override',
        signalType: 'manual_override',
        subjects: [
          {
            subject_key: 'user:user-1',
            subject_type: 'user',
          },
        ],
        userId: 'admin-1',
      })
    );
  });
});
