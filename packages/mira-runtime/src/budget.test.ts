import { describe, expect, it } from 'vitest';
import {
  type BudgetLedger,
  MissingPriceError,
  type ModelPrice,
  reserve,
  rollLedger,
  settle,
  usageCostMicroUsd,
  worstCaseMicroUsd,
} from './budget';

// $2 / $0.10 / $10 per million tokens, in micro-USD per million.
const PRICE: ModelPrice = {
  inputPerMillion: 2_000_000,
  cachedInputPerMillion: 100_000,
  outputPerMillion: 10_000_000,
  cacheWriteMultiplier: 1.25,
};

const EMPTY: BudgetLedger = {
  dayKey: '2026-11-21',
  monthKey: '2026-11',
  daySpentMicroUsd: 0,
  monthSpentMicroUsd: 0,
  dayReservedMicroUsd: 0,
  monthReservedMicroUsd: 0,
};

describe('budget', () => {
  it('prices usage exactly and rounds up', () => {
    expect(
      usageCostMicroUsd(PRICE, {
        inputTokens: 1000,
        cachedInputTokens: 2000,
        cacheWriteTokens: 0,
        outputTokens: 150,
      })
    ).toBe(2000 + 200 + 1500);
    expect(
      usageCostMicroUsd(PRICE, {
        inputTokens: 1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
      })
    ).toBe(2);
  });

  it('fails closed on missing or invalid prices', () => {
    expect(() => worstCaseMicroUsd(null, 100, 100)).toThrow(MissingPriceError);
    expect(() =>
      worstCaseMicroUsd({ ...PRICE, outputPerMillion: Number.NaN }, 100, 100)
    ).toThrow(MissingPriceError);
  });

  it('rejects negative or fractional token counts', () => {
    expect(() =>
      usageCostMicroUsd(PRICE, {
        inputTokens: -1,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
      })
    ).toThrow();
  });

  it('counts outstanding reservations against the caps', () => {
    const caps = { dailyMicroUsd: 10_000, monthlyMicroUsd: 1_000_000 };
    const first = reserve(EMPTY, caps, 6_000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(reserve(first.ledger, caps, 6_000)).toEqual({
      ok: false,
      reason: 'daily_cap',
    });
  });

  it('enforces the monthly cap separately', () => {
    const caps = { dailyMicroUsd: 1_000_000, monthlyMicroUsd: 5_000 };
    expect(
      reserve({ ...EMPTY, monthSpentMicroUsd: 4_000 }, caps, 2_000)
    ).toEqual({ ok: false, reason: 'monthly_cap' });
  });

  it('settles actual spend even above the reservation', () => {
    const caps = { dailyMicroUsd: 100_000, monthlyMicroUsd: 100_000 };
    const reserved = reserve(EMPTY, caps, 1_000);
    if (!reserved.ok) throw new Error('expected reservation');
    const settled = settle(reserved.ledger, reserved.reservation, 1_500);
    expect(settled.dayReservedMicroUsd).toBe(0);
    expect(settled.daySpentMicroUsd).toBe(1_500);
    expect(settled.monthSpentMicroUsd).toBe(1_500);
  });

  it('fails closed on invalid caps or ledger values', () => {
    expect(
      reserve(EMPTY, { dailyMicroUsd: Number.NaN, monthlyMicroUsd: 1 }, 1)
    ).toEqual({ ok: false, reason: 'invalid_state' });
    expect(
      reserve(
        { ...EMPTY, daySpentMicroUsd: Number.NaN },
        { dailyMicroUsd: 10, monthlyMicroUsd: 10 },
        1
      )
    ).toEqual({ ok: false, reason: 'invalid_state' });
    expect(
      reserve(EMPTY, { dailyMicroUsd: 10, monthlyMicroUsd: 10 }, -1)
    ).toEqual({ ok: false, reason: 'invalid_state' });
  });

  it('does not release a newer period reservation after a rollover', () => {
    const caps = { dailyMicroUsd: 100, monthlyMicroUsd: 1_000 };
    const first = reserve(EMPTY, caps, 60);
    if (!first.ok) throw new Error('expected reservation');
    const nextDay = rollLedger(first.ledger, '2026-11-22', '2026-11');
    const second = reserve(nextDay, caps, 90);
    if (!second.ok) throw new Error('expected reservation');
    const settled = settle(second.ledger, first.reservation, 60);
    expect(settled.dayReservedMicroUsd).toBe(90);
    // The month reservation from day one is released within the same month.
    expect(settled.monthReservedMicroUsd).toBe(90);
    expect(reserve(settled, caps, 1)).toEqual({
      ok: false,
      reason: 'daily_cap',
    });
  });

  it('prices the worst case at the highest input rate', () => {
    const freeWrites = { ...PRICE, cacheWriteMultiplier: 0 };
    expect(worstCaseMicroUsd(freeWrites, 1_000_000, 0)).toBe(2_000_000);
    expect(worstCaseMicroUsd(PRICE, 1_000_000, 0)).toBe(2_500_000);
    expect(worstCaseMicroUsd(PRICE, 0, 1_000)).toBe(10_000);
  });

  it('resets day and month counters at period boundaries', () => {
    const busy = { ...EMPTY, daySpentMicroUsd: 5, monthSpentMicroUsd: 9 };
    expect(rollLedger(busy, '2026-11-22', '2026-11')).toMatchObject({
      daySpentMicroUsd: 0,
      monthSpentMicroUsd: 9,
    });
    expect(rollLedger(busy, '2026-12-01', '2026-12')).toMatchObject({
      daySpentMicroUsd: 0,
      monthSpentMicroUsd: 0,
    });
  });
});
