import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordAbuseActivitySignal: vi.fn(),
  writeTrustCacheForSubjects: vi.fn(),
  writeVerifiedSessionCacheForSubjects: vi.fn(),
}));

vi.mock('@tuturuuu/turnstile/server', () => ({
  isTurnstileError: () => false,
  verifyTurnstileToken: vi.fn(),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  buildRateLimitDecision: vi.fn(),
  getSignalForResponseStatus: () => ({
    confidenceDelta: 1,
    scoreDelta: 1,
    signalType: 'organic_activity',
  }),
  recordAbuseActivitySignal: (input: unknown) =>
    mocks.recordAbuseActivitySignal(input),
  recordAbuseStepUpChallenge: vi.fn(),
  resolveAbuseRiskDecision: vi.fn(),
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge-trust', () => ({
  writeTrustCacheForSubjects: (...args: unknown[]) =>
    mocks.writeTrustCacheForSubjects(...args),
  writeVerifiedSessionCacheForSubjects: (...args: unknown[]) =>
    mocks.writeVerifiedSessionCacheForSubjects(...args),
}));

const standardDecision = {
  confidenceScore: 10,
  decisionSource: 'default',
  reasons: [],
  riskScore: 50,
  subjectKey: 'user:user-123',
  subjects: [
    { subject_key: 'user:user-123', subject_type: 'user' },
    { subject_key: 'session:session-123', subject_type: 'session' },
  ],
  tier: 'standard',
  trustMultiplier: 1,
};

describe('recordResponseAbuseSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a neutral verified session marker after a successful authenticated response', async () => {
    const { recordResponseAbuseSignal } = await import('../lib/abuse-risk');

    recordResponseAbuseSignal({
      decision: standardDecision as any,
      ipAddress: '1.2.3.4',
      method: 'GET',
      response: NextResponse.json({ ok: true }),
      route: '/api/v1/users/me/profile',
      userId: 'user-123',
    });

    expect(mocks.writeVerifiedSessionCacheForSubjects).toHaveBeenCalledWith([
      'session:session-123',
    ]);
    expect(mocks.writeTrustCacheForSubjects).not.toHaveBeenCalled();
  });

  it('preserves elevated trusted session write-through', async () => {
    const { recordResponseAbuseSignal } = await import('../lib/abuse-risk');

    recordResponseAbuseSignal({
      decision: {
        ...standardDecision,
        tier: 'trusted',
        trustMultiplier: 3,
      } as any,
      ipAddress: '1.2.3.4',
      method: 'GET',
      response: NextResponse.json({ ok: true }),
      route: '/api/v1/users/me/profile',
      userId: 'user-123',
    });

    expect(mocks.writeTrustCacheForSubjects).toHaveBeenCalledWith(
      ['session:session-123'],
      3
    );
    expect(mocks.writeVerifiedSessionCacheForSubjects).not.toHaveBeenCalled();
  });

  it('does not write session markers for restricted or failed responses', async () => {
    const { recordResponseAbuseSignal } = await import('../lib/abuse-risk');

    recordResponseAbuseSignal({
      decision: {
        ...standardDecision,
        tier: 'restricted',
      } as any,
      ipAddress: '1.2.3.4',
      method: 'GET',
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      route: '/api/v1/users/me/profile',
      userId: 'user-123',
    });

    expect(mocks.writeTrustCacheForSubjects).not.toHaveBeenCalled();
    expect(mocks.writeVerifiedSessionCacheForSubjects).not.toHaveBeenCalled();
  });

  it('does not write verified session markers for API key responses', async () => {
    const { recordResponseAbuseSignal } = await import('../lib/abuse-risk');

    recordResponseAbuseSignal({
      apiKeyId: 'api-key-123',
      decision: standardDecision as any,
      ipAddress: '1.2.3.4',
      method: 'GET',
      response: NextResponse.json({ ok: true }),
      route: '/api/v1/workspaces/ws-1/tasks',
      userId: 'user-123',
    });

    expect(mocks.writeTrustCacheForSubjects).not.toHaveBeenCalled();
    expect(mocks.writeVerifiedSessionCacheForSubjects).not.toHaveBeenCalled();
  });

  it('does not write session markers for challenge-tier responses', async () => {
    const { recordResponseAbuseSignal } = await import('../lib/abuse-risk');

    recordResponseAbuseSignal({
      decision: {
        ...standardDecision,
        tier: 'challenge_required',
      } as any,
      ipAddress: '1.2.3.4',
      method: 'GET',
      response: NextResponse.json({ ok: true }),
      route: '/api/v1/users/me/profile',
      userId: 'user-123',
    });

    expect(mocks.writeTrustCacheForSubjects).not.toHaveBeenCalled();
    expect(mocks.writeVerifiedSessionCacheForSubjects).not.toHaveBeenCalled();
  });
});
