import { describe, expect, it } from 'vitest';
import {
  calculateFeeLockTotals,
  getCurrencyMinorUnits,
  toScaledInteger,
} from './calculator';

const tuition = (overrides = {}) => ({
  kind: 'tuition' as const,
  unit_price: 150_000,
  quantity: 8,
  baseline_quantity: 8,
  ...overrides,
});

describe('calculateFeeLockTotals', () => {
  it('prices sessions, adjustments and extras in VND', () => {
    const result = calculateFeeLockTotals(
      [
        tuition({ adjustment_amount: -100_000, reason: 'Thành tích' }),
        { kind: 'extra', unit_price: 85_000, quantity: 2 },
      ],
      { currency: 'VND' }
    );
    expect(result).toEqual({
      currency: 'VND',
      minor_units: 0,
      line_amounts: [1_100_000, 170_000],
      total_amount: 1_270_000,
      issues: [],
    });
  });

  it('rounds each line half away from zero to the minor unit', () => {
    const vnd = calculateFeeLockTotals(
      [
        { kind: 'extra', unit_price: 0.5, quantity: 1 },
        { kind: 'extra', unit_price: 33_333.333333, quantity: 1.5 },
      ],
      { currency: 'VND' }
    );
    expect(vnd.line_amounts).toEqual([1, 50_000]);
    expect(vnd.total_amount).toBe(50_001);

    const usd = calculateFeeLockTotals(
      [
        { kind: 'extra', unit_price: 0.1, quantity: 3 },
        { kind: 'extra', unit_price: 0.005, quantity: 1 },
      ],
      { currency: 'USD' }
    );
    expect(usd.line_amounts).toEqual([0.3, 0.01]);
    expect(usd.total_amount).toBe(0.31);
  });

  it('requires a reason for adjustments or sessions that differ from the baseline', () => {
    const result = calculateFeeLockTotals(
      [
        tuition({ adjustment_amount: 50_000, reason: '  ' }),
        tuition({ quantity: 6 }),
        tuition({ quantity: 6, reason: 'Nghỉ 2 buổi' }),
        { kind: 'extra', unit_price: 1, quantity: 1, baseline_quantity: 3 },
      ],
      { currency: 'VND' }
    );
    expect(result.issues).toEqual([
      { index: 0, code: 'reason_required' },
      { index: 1, code: 'reason_required' },
    ]);
  });

  it('flags invalid input and negative lines without throwing', () => {
    const result = calculateFeeLockTotals(
      [
        tuition({ adjustment_amount: -2_000_000, reason: 'x' }),
        tuition({ quantity: 0 }),
        tuition({ unit_price: Number.NaN }),
        tuition({ quantity: 1.0005, baseline_quantity: null }),
      ],
      { currency: 'VND' }
    );
    expect(result.issues).toEqual([
      { index: 0, code: 'negative_line' },
      { index: 1, code: 'invalid_quantity' },
      { index: 1, code: 'reason_required' },
      { index: 2, code: 'invalid_price' },
      { index: 3, code: 'invalid_quantity' },
    ]);
    expect(result.line_amounts).toEqual([-800_000, 0, 0, 0]);
  });

  it('stays exact where float maths drifts', () => {
    const lines = Array.from({ length: 10 }, () => ({
      kind: 'extra' as const,
      unit_price: 0.1,
      quantity: 1,
    }));
    expect(
      calculateFeeLockTotals(lines, { currency: 'USD' }).total_amount
    ).toBe(1);
  });
});

describe('helpers', () => {
  it('resolves currency minor units with a safe fallback', () => {
    expect(getCurrencyMinorUnits('VND')).toBe(0);
    expect(getCurrencyMinorUnits('USD')).toBe(2);
    expect(getCurrencyMinorUnits('not-a-code')).toBe(2);
  });

  it('scales decimals exactly and rejects excess precision', () => {
    expect(toScaledInteger(1.5, 3)).toBe(1500n);
    expect(toScaledInteger(-0.000001, 6)).toBe(-1n);
    expect(toScaledInteger(0.0001, 3)).toBeNull();
    expect(toScaledInteger(Number.POSITIVE_INFINITY, 3)).toBeNull();
  });
});
