import { describe, expect, it, vi } from 'vitest';
import { assessMeetGuestUnverifiedJoin } from './guest-unverified-risk';

vi.mock('@tuturuuu/utils/abuse-protection/reputation', () => ({
  applyRateLimitDecision: (
    max: number,
    decision: { trustMultiplier: number }
  ) => Math.max(1, Math.floor(max * decision.trustMultiplier)),
  recordAbuseActivitySignal: vi.fn(),
  resolveAbuseRiskDecision: vi.fn(),
}));

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const subjects = [{ subject_key: 'ip:203.0.113.4', subject_type: 'ip' }];

function decision(tier: string, trustMultiplier = 1) {
  return {
    confidenceScore: 40,
    decisionSource: 'heuristic',
    reasons: [],
    riskScore: 50,
    subjectKey: 'ip:203.0.113.4',
    subjects,
    tier,
    trustMultiplier,
  } as never;
}

const request = () =>
  new Request('https://meet.test/api/meet-call/x/guest', { method: 'POST' });

describe('assessMeetGuestUnverifiedJoin', () => {
  it('scores the request as an anonymous mutation and records it', async () => {
    const resolve = vi.fn().mockResolvedValue(decision('standard'));
    const record = vi.fn().mockResolvedValue(undefined);
    await expect(
      assessMeetGuestUnverifiedJoin(
        request(),
        { meetingId, network: '203.0.113.4' },
        { resolve, record }
      )
    ).resolves.toMatchObject({ allowed: true, networkLimit: 3 });
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        authKind: 'temp',
        ipAddress: '203.0.113.4',
        isRead: false,
        method: 'POST',
      })
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'meet_guest_unverified_join',
        signalType: 'challenge_issued',
        subjects,
      })
    );
  });

  it.each(['restricted', 'challenge_required'])(
    'refuses the %s tier and records a failed challenge',
    async (tier) => {
      const record = vi.fn().mockResolvedValue(undefined);
      const result = await assessMeetGuestUnverifiedJoin(
        request(),
        { meetingId, network: '203.0.113.4' },
        { resolve: vi.fn().mockResolvedValue(decision(tier)), record }
      );
      expect(result.allowed).toBe(false);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          reasonCode: 'meet_guest_unverified_refused',
          signalType: 'challenge_failed',
        })
      );
    }
  );

  it('shrinks the network budget for watched subjects', async () => {
    const result = await assessMeetGuestUnverifiedJoin(
      request(),
      { meetingId, network: '203.0.113.4' },
      {
        resolve: vi.fn().mockResolvedValue(decision('watch', 0.5)),
        record: vi.fn().mockResolvedValue(undefined),
      }
    );
    expect(result).toMatchObject({ allowed: true, networkLimit: 1 });
  });

  it('never grows the budget for trusted subjects', async () => {
    const result = await assessMeetGuestUnverifiedJoin(
      request(),
      { meetingId, network: '203.0.113.4' },
      {
        resolve: vi.fn().mockResolvedValue(decision('trusted', 4)),
        record: vi.fn().mockResolvedValue(undefined),
      }
    );
    expect(result).toMatchObject({ allowed: true, networkLimit: 3 });
  });

  it('keeps the base budget when the reputation store is unreachable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const record = vi.fn();
    const result = await assessMeetGuestUnverifiedJoin(
      request(),
      { meetingId, network: undefined },
      { resolve: vi.fn().mockRejectedValue(new Error('down')), record }
    );
    expect(result).toEqual({ allowed: true, decision: null, networkLimit: 3 });
    expect(record).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
