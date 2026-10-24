import { describe, expect, it } from 'vitest';
import { admit, BUDGET_SNAPSHOT_BYTES, emptyState } from './budget';
import { LIMITS, parseTokens, readConfig } from './config';

const SHA = 'a'.repeat(64);
const now = new Date('2026-10-31T23:59:00Z');

function config(overrides: Record<string, string>) {
  return readConfig({
    ARTIFACTS: {} as never,
    BUDGET: {} as never,
    ...overrides,
  });
}

describe('configuration bounds', () => {
  it('defaults to off and to safe limits', () => {
    const value = config({});
    expect(value.mode).toBe('off');
    expect(value.requireSignature).toBe(true);
    expect(value.tokens).toEqual([]);
    expect(value.maxArtifactBytes).toBe(LIMITS.maxArtifactBytes[0]);
    expect(config({ TURBO_CACHE_MODE: 'READ-WRITE' }).mode).toBe('off');
  });

  it('clamps overrides to hard ceilings and ignores garbage', () => {
    const value = config({
      TURBO_CACHE_MAX_ARTIFACT_BYTES: '999999999999',
      TURBO_CACHE_TTL_DAYS: '365',
      TURBO_CACHE_DAILY_CLASS_A: '-5',
      TURBO_CACHE_MONTHLY_CLASS_A_FENCE: '1e9',
    });
    expect(value.maxArtifactBytes).toBe(LIMITS.maxArtifactBytes[1]);
    expect(value.ttlMs).toBe(LIMITS.ttlDays[1] * 24 * 60 * 60 * 1000);
    expect(value.budget.dailyClassA).toBe(LIMITS.dailyClassA[0]);
    expect(value.budget.monthlyClassAFence).toBe(LIMITS.monthlyClassAFence[0]);
  });

  it('only accepts writers that read their own scope first', () => {
    expect(
      parseTokens(
        JSON.stringify([
          { id: 'a', sha256: SHA, read: ['main'], write: 'main' },
        ])
      )
    ).toHaveLength(1);
    for (const entry of [
      { id: 'a', sha256: SHA, read: ['main'], write: 'branch' },
      { id: 'a', sha256: SHA, read: ['main', 'branch'], write: 'branch' },
      { id: 'a', sha256: SHA, read: [] },
      { id: 'A', sha256: SHA, read: ['main'] },
      { id: 'a', sha256: SHA, read: ['main', 'main'] },
    ]) {
      expect(parseTokens(JSON.stringify([entry]))).toEqual([]);
    }
    expect(
      parseTokens(
        JSON.stringify([
          { id: 'a', sha256: SHA, read: ['main'] },
          { id: 'a', sha256: SHA, read: ['main'] },
        ])
      )
    ).toEqual([]);
  });
});

describe('budget accounting', () => {
  const limits = {
    dailyClassA: 12,
    dailyClassB: 20,
    dailyWriteBytes: BUDGET_SNAPSHOT_BYTES * 2 + 100,
    monthlyClassAFence: 22,
  };

  it('reserves declared bytes and denies without counting', () => {
    let state = emptyState(now);
    let result = admit(
      state,
      { operation: 'class-a', count: 1, bytes: 90 },
      limits,
      now
    );
    expect(result.allowed).toBe(true);
    state = result.state;
    result = admit(
      state,
      { operation: 'class-a', count: 1, bytes: 20 },
      limits,
      now
    );
    expect(result).toMatchObject({
      allowed: false,
      reason: 'daily-write-bytes',
    });
    expect(result.state.dailyClassA).toBe(2);
  });

  it('resets the monthly counter with the month but never the fence', () => {
    let state = emptyState(now);
    state = admit(
      state,
      { operation: 'class-a', count: 11, bytes: 0 },
      limits,
      now
    ).state;
    const nextDay = new Date('2026-11-01T00:01:00Z');
    const fresh = admit(
      state,
      { operation: 'class-a', count: 11, bytes: 0 },
      limits,
      nextDay
    );
    expect(fresh.allowed).toBe(true);
    expect(fresh.state.monthlyClassA).toBe(12);
    const tripped = admit(
      fresh.state,
      { operation: 'class-a', count: 11, bytes: 0 },
      limits,
      nextDay
    );
    expect(tripped).toMatchObject({
      allowed: false,
      reason: 'monthly-class-a',
    });
    const terminal = admit(
      { ...fresh.state, dailyClassA: 0, dailyWriteBytes: 0 },
      { operation: 'class-a', count: 9, bytes: 0 },
      limits,
      nextDay
    );
    expect(terminal.allowed).toBe(true);
    expect(terminal.state.monthlyClassA).toBe(22);
    const nextMonth = new Date('2026-12-01T00:00:00Z');
    expect(
      admit(
        terminal.state,
        { operation: 'class-b', count: 1, bytes: 0 },
        limits,
        nextMonth
      ).reason
    ).toBe('fenced');
  });
});
