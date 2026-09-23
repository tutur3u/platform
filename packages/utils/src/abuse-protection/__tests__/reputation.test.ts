import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockCreateAdminClient = vi.fn(() => ({
  rpc: mockRpc,
  from: mockFrom,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mockCreateAdminClient(),
}));

import {
  buildAbuseRiskSubjects,
  resolveAbuseRiskDecision,
} from '../reputation';

const browserHeaders = {
  cookie: 'sb-test-auth-token=stable-session-token',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

describe('adaptive abuse reputation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T00:00:00.000Z'));
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('binds native subjects to authenticated bearer credentials, never a raw token or an anonymous caller', () => {
    const subjects = (token: string, userId?: string) =>
      buildAbuseRiskSubjects({
        headers: { authorization: `Bearer ${token}` },
        userId,
      });
    expect(subjects('secret', 'caller')).toContainEqual(
      expect.objectContaining({ subject_type: 'session' })
    );
    expect(JSON.stringify(subjects('secret', 'caller'))).not.toContain(
      'secret'
    );
    expect(subjects('secret', 'caller')).not.toEqual(
      subjects('rotated', 'caller')
    );
    expect(subjects('secret')).toEqual([]);
  });

  it.each([true, false])(
    'reuses only a recent passed challenge for this authenticated session: %s',
    async (passed) => {
      const lookup = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gt: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: passed ? [{ id: 'proof' }] : [],
          error: null,
        }),
      };
      mockFrom.mockReturnValue(lookup);
      const decision = await resolveAbuseRiskDecision({
        authKind: 'session',
        headers: {
          authorization: 'Bearer session-token',
          'user-agent': 'Dart/3.9 (dart:io)',
        },
        isRead: false,
        method: 'POST',
        route: '/tasks',
        userId: 'caller',
      });
      expect(decision.tier).toBe(passed ? 'standard' : 'challenge_required');
      expect(decision.trustMultiplier).toBe(1);
      expect(lookup.eq).toHaveBeenCalledWith('user_id', 'caller');
      expect(lookup.eq).toHaveBeenCalledWith(
        'subject_key',
        decision.subjects.find((subject) => subject.subject_type === 'session')
          ?.subject_key
      );
      expect(lookup.eq).toHaveBeenCalledWith('status', 'passed');
      expect(lookup.gt).toHaveBeenCalledWith(
        'expires_at',
        '2026-05-17T00:00:00.000Z'
      );
      expect(lookup.gte).toHaveBeenCalledWith(
        'completed_at',
        '2026-05-16T23:45:00.000Z'
      );
    }
  );

  it.each(['restricted', 'challenge_required'])(
    'never overrides explicit server policy: %s',
    async (tier) => {
      mockRpc.mockResolvedValue({
        data: [{ tier, trust_multiplier: 1, decision_source: 'override' }],
        error: null,
      });
      const decision = await resolveAbuseRiskDecision({
        authKind: 'session',
        headers: {
          authorization: 'Bearer session-token',
          'user-agent': 'Dart/3.9 (dart:io)',
        },
        isRead: false,
        method: 'POST',
        route: '/tasks',
        userId: 'caller',
      });
      expect(decision.tier).toBe(tier);
      expect(mockFrom).not.toHaveBeenCalled();
    }
  );

  it('fails closed when challenge storage is unavailable', async () => {
    mockFrom.mockImplementation(() => {
      throw new Error('offline');
    });
    const decision = await resolveAbuseRiskDecision({
      authKind: 'session',
      headers: {
        authorization: 'Bearer session-token',
        'user-agent': 'Dart/3.9 (dart:io)',
      },
      isRead: false,
      method: 'POST',
      route: '/tasks',
      userId: 'caller',
    });
    expect(decision.tier).toBe('challenge_required');
  });

  it('does not earn trust from old account and browser shape alone', async () => {
    const decision = await resolveAbuseRiskDecision({
      authKind: 'session',
      headers: browserHeaders,
      ipAddress: '203.0.113.10',
      isRead: true,
      method: 'GET',
      route: '/api/v1/workspaces/ws-1/tasks',
      userCreatedAt: '2025-01-01T00:00:00.000Z',
      userId: 'user-1',
    });

    expect(decision.tier).toBe('standard');
    expect(decision.trustMultiplier).toBe(1);
    expect(decision.reasons).toContain('established_account');
  });

  it('allows clean long-lived reputation to receive trusted limits', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          decision_source: 'reputation',
          subject_key: 'user:user-1',
          tier: 'trusted',
          trust_multiplier: 3,
        },
      ],
      error: null,
    });

    const decision = await resolveAbuseRiskDecision({
      authKind: 'session',
      headers: browserHeaders,
      ipAddress: '203.0.113.10',
      isRead: true,
      method: 'GET',
      route: '/api/v1/workspaces/ws-1/tasks',
      userCreatedAt: '2025-01-01T00:00:00.000Z',
      userId: 'user-1',
    });

    expect(decision.tier).toBe('trusted');
    expect(decision.trustMultiplier).toBe(3);
    expect(decision.reasons).toContain('server_reputation_trusted');
  });

  it('suppresses trusted reputation when current browser mutation is scripted', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          decision_source: 'reputation',
          subject_key: 'user:user-1',
          tier: 'trusted',
          trust_multiplier: 3,
        },
      ],
      error: null,
    });

    const decision = await resolveAbuseRiskDecision({
      authKind: 'session',
      headers: {
        'user-agent': 'curl/8.7.1',
      },
      ipAddress: '203.0.113.10',
      isRead: false,
      method: 'POST',
      route: '/api/v1/workspaces/ws-1/tasks',
      userCreatedAt: '2025-01-01T00:00:00.000Z',
      userId: 'user-1',
    });

    expect(decision.tier).toBe('challenge_required');
    expect(decision.trustMultiplier).toBe(1);
    expect(decision.reasons).toContain('scripted_http_client');
    expect(decision.reasons).toContain('suspicious_browser_mutation');
  });

  it('keeps recent abuse restrictions stronger than account age', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          decision_source: 'reputation',
          subject_key: 'user:user-1',
          tier: 'restricted',
          trust_multiplier: 0.35,
        },
      ],
      error: null,
    });

    const decision = await resolveAbuseRiskDecision({
      authKind: 'session',
      headers: browserHeaders,
      ipAddress: '203.0.113.10',
      isRead: true,
      method: 'GET',
      route: '/api/v1/workspaces/ws-1/tasks',
      userCreatedAt: '2025-01-01T00:00:00.000Z',
      userId: 'user-1',
    });

    expect(decision.tier).toBe('restricted');
    expect(decision.trustMultiplier).toBe(0.35);
    expect(decision.reasons).toContain('server_reputation_restricted');
  });

  it('builds API-key reputation subjects without browser challenge semantics', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          decision_source: 'reputation',
          subject_key: 'api-key:key-1',
          tier: 'trusted',
          trust_multiplier: 2,
        },
      ],
      error: null,
    });

    const decision = await resolveAbuseRiskDecision({
      apiKeyId: 'key-1',
      authKind: 'api-key',
      headers: {
        'user-agent': 'Dart/3.9 (dart:io)',
      },
      ipAddress: '203.0.113.10',
      isRead: false,
      method: 'POST',
      route: '/api/v1/workspaces/ws-1/tasks',
      workspaceId: 'ws-1',
    });

    expect(decision.tier).toBe('trusted');
    expect(decision.trustMultiplier).toBe(2);
    expect(decision.subjects).toContainEqual({
      subject_key: 'api-key:key-1',
      subject_type: 'api_key',
    });
  });

  it('tracks user, session, IP, CIDR, and user-location subjects together', () => {
    expect(
      buildAbuseRiskSubjects({
        headers: browserHeaders,
        ipAddress: '203.0.113.10',
        userId: 'user-1',
      })
    ).toEqual(
      expect.arrayContaining([
        { subject_key: 'user:user-1', subject_type: 'user' },
        { subject_key: 'ip:203.0.113.10', subject_type: 'ip' },
        { subject_key: 'cidr:203.0.113.0/24', subject_type: 'cidr' },
        {
          subject_key: 'user-location:user-1:203.0.113.10',
          subject_type: 'user_location',
        },
        expect.objectContaining({ subject_type: 'session' }),
      ])
    );
  });
});
