import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  authorize: vi.fn(),
  defaultTrustMultiplierForTier: vi.fn(),
  insert: vi.fn(),
  recordSignal: vi.fn(),
  requestFrom: vi.fn(),
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

import { GET, POST } from './route';

describe('abuse intelligence route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.defaultTrustMultiplierForTier.mockReturnValue(3);
    mocks.adminFrom.mockReturnValue({
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

  it('loads trust overrides through the server-owned client', async () => {
    const makeListQuery = (result: unknown) => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve(result)),
        })),
      })),
    });
    const makeOverrideQuery = (result: unknown) => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(result)),
          })),
        })),
      })),
    });

    const subjectsResult = {
      data: [
        {
          negative_signal_count: 1,
          reputation_score: 5,
          tier: 'standard',
        },
      ],
      error: null,
    };
    const emptyResult = { data: [], error: null };
    const overridesResult = {
      data: [
        {
          id: 'override-1',
          subject_key: 'user:user-1',
          subject_type: 'user',
          tier: 'trusted',
        },
      ],
      error: null,
    };

    const requestTables = {
      abuse_activity_signals: makeListQuery(emptyResult),
      abuse_reputation_subjects: makeListQuery(subjectsResult),
      abuse_step_up_challenges: makeListQuery(emptyResult),
    };

    mocks.requestFrom.mockImplementation(
      (table: keyof typeof requestTables) => requestTables[table]
    );
    mocks.adminFrom.mockReturnValue(makeOverrideQuery(overridesResult));
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        from: mocks.adminFrom,
      },
      supabase: {
        from: mocks.requestFrom,
      },
      user: {
        id: 'admin-1',
      },
    });

    const response = await GET(
      new Request('http://localhost/api/v1/infrastructure/abuse-intelligence')
    );

    expect(response.status).toBe(200);
    expect(mocks.requestFrom).toHaveBeenCalledWith('abuse_reputation_subjects');
    expect(mocks.requestFrom).toHaveBeenCalledWith('abuse_activity_signals');
    expect(mocks.requestFrom).toHaveBeenCalledWith('abuse_step_up_challenges');
    expect(mocks.requestFrom).not.toHaveBeenCalledWith('abuse_trust_overrides');
    expect(mocks.adminFrom).toHaveBeenCalledWith('abuse_trust_overrides');

    const body = await response.json();
    expect(body.summary.activeOverrideCount).toBe(1);
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
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('creates audited manual overrides for root admins', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        from: mocks.adminFrom,
      },
      supabase: {
        from: mocks.requestFrom,
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
    expect(mocks.adminFrom).toHaveBeenCalledWith('abuse_trust_overrides');
    expect(mocks.requestFrom).not.toHaveBeenCalled();
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
