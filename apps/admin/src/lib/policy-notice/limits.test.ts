import { describe, expect, it } from 'vitest';
import { PolicyNoticeError } from './errors';
import { evaluateBreaker, resolvePolicyNoticeLimits } from './limits';

describe('policy notice limits', () => {
  it('defaults conservatively and rejects values beyond SES-safe caps', () => {
    expect(resolvePolicyNoticeLimits(undefined)).toEqual({
      sendsPerSecond: 2,
      batchSize: 20,
      maxSendsPerInvocation: 200,
      timeBudgetMs: 240_000,
      maxBounceRate: 0.02,
      maxComplaintRate: 0.001,
      maxUnknownRate: 0.02,
    });
    for (const bad of [
      { sendsPerSecond: 50 },
      { maxBounceRate: 0.2 },
      { maxComplaintRate: 0.01 },
      { timeBudgetMs: 600_000 },
      { batchSize: 0 },
      { minSample: 1_000_000 },
      { minSample: 100 },
    ]) {
      expect(() => resolvePolicyNoticeLimits(bad)).toThrow(PolicyNoticeError);
    }
  });

  it('measures rates against at least the minimum sample', () => {
    const limits = resolvePolicyNoticeLimits(undefined);
    const healthy = {
      attempted: 10,
      rejected: 1,
      unknown: 0,
      hardBounces: 0,
      complaints: 0,
    };
    expect(evaluateBreaker(healthy, limits)).toBeNull();
    expect(evaluateBreaker({ ...healthy, complaints: 1 }, limits)).toBe(
      'complaint_rate'
    );
    expect(
      evaluateBreaker({ ...healthy, attempted: 1000, rejected: 21 }, limits)
    ).toBe('bounce_rate');
  });

  it('cannot be loosened enough to disable the bounce or complaint breaker', () => {
    const loosest = resolvePolicyNoticeLimits({
      maxBounceRate: 0.05,
      maxComplaintRate: 0.001,
      maxUnknownRate: 0.05,
    });
    const quiet = {
      attempted: 100,
      rejected: 0,
      unknown: 0,
      hardBounces: 0,
      complaints: 0,
    };
    expect(evaluateBreaker({ ...quiet, complaints: 1 }, loosest)).toBe(
      'complaint_rate'
    );
    expect(evaluateBreaker({ ...quiet, hardBounces: 6 }, loosest)).toBe(
      'bounce_rate'
    );
    expect(evaluateBreaker({ ...quiet, unknown: 6 }, loosest)).toBe(
      'unknown_rate'
    );
  });
});
