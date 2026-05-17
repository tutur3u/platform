import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();
const mockCreateAdminClient = vi.fn(() => ({
  rpc: mockRpc,
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
