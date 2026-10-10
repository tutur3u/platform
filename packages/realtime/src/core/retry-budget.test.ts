import { describe, expect, it } from 'vitest';
import { planRetryReservation, type RetryBudget } from './retry-budget';

const policy = { maxAttempts: 3, maxAgeMs: 120_000, delayMs: 30_000 };
const start = 1_800_000_000_000;

describe('portable retry reservation', () => {
  it('keeps a fixed deadline and consumes attempts across reconstruction', () => {
    let saved: RetryBudget | undefined;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const now = start + (attempt - 1) * 30_000;
      const plan = planRetryReservation(structuredClone(saved), now, policy);
      expect(plan.kind).toBe('reserve');
      if (plan.kind !== 'reserve') throw new Error('Expected reservation');
      saved = structuredClone(plan.reservation);
      expect(saved).toEqual({
        attempts: attempt,
        nextAt: now + 30_000,
        expiresAt: start + 120_000,
      });
    }
    // Repeated failures, no progress and a backward clock never renew attempts.
    for (const now of [start, start + 90_000, start + 120_000]) {
      expect(planRetryReservation(saved, now, policy)).toEqual({
        kind: 'stop',
      });
    }
  });

  it('waits on duplicate delivery without mutating or consuming persisted state', () => {
    const saved = Object.freeze({
      attempts: 1,
      nextAt: start + 30_000,
      expiresAt: start + 120_000,
    });
    for (const now of [start - 1, start, start + 29_999]) {
      expect(planRetryReservation(saved, now, policy)).toEqual({
        kind: 'wait',
        at: start + 30_000,
      });
    }
    expect(planRetryReservation(saved, start + 30_000, policy)).toEqual({
      kind: 'reserve',
      reservation: { ...saved, attempts: 2, nextAt: start + 60_000 },
    });
    expect(saved.attempts).toBe(1);
  });

  it('clamps a late reservation to expiry and stops at the exact deadline', () => {
    const saved = { attempts: 1, nextAt: start, expiresAt: start + 120_000 };
    expect(planRetryReservation(saved, start + 119_999, policy)).toEqual({
      kind: 'reserve',
      reservation: { ...saved, attempts: 2, nextAt: saved.expiresAt },
    });
    for (const now of [start + 120_000, start + 1_000_000]) {
      expect(planRetryReservation(saved, now, policy)).toEqual({
        kind: 'stop',
      });
    }
  });

  it.each([
    null,
    { attempts: -1 },
    { attempts: 0.5 },
    { attempts: Number.NaN },
    { nextAt: Number.POSITIVE_INFINITY },
    { nextAt: -1 },
    { nextAt: start + 120_001 },
    { expiresAt: Number.NaN },
    { expiresAt: Number.MAX_SAFE_INTEGER + 1 },
    { expiresAt: start - 1 },
  ])('fails closed on corrupt durable state %j', (override) => {
    const saved =
      override === null
        ? null
        : {
            attempts: 0,
            nextAt: start,
            expiresAt: start + 120_000,
            ...override,
          };
    expect(planRetryReservation(saved as RetryBudget, start, policy)).toEqual({
      kind: 'stop',
    });
  });

  it.each([
    { maxAttempts: 0 },
    { maxAttempts: 1.5 },
    { maxAgeMs: 0 },
    { maxAgeMs: Number.POSITIVE_INFINITY },
    { delayMs: -1 },
    { delayMs: Number.NaN },
  ])('rejects an invalid policy %j', (override) => {
    expect(
      planRetryReservation(undefined, start, { ...policy, ...override })
    ).toEqual({ kind: 'stop' });
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    0.5,
    Number.MAX_SAFE_INTEGER,
  ])('never creates an unsafe or nonfuture deadline at %s', (now) => {
    expect(planRetryReservation(undefined, now, policy)).toEqual({
      kind: 'stop',
    });
  });
});
