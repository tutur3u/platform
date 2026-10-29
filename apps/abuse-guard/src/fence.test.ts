import { describe, expect, it } from 'vite-plus/test';
import { resolveFamilyBudgets } from './fence';

const resolve = (total?: string, split?: string) =>
  resolveFamilyBudgets({
    ABUSE_GUARD_DAILY_OP_BUDGET: total,
    ABUSE_GUARD_FAMILY_BUDGETS: split,
  });

describe('resolveFamilyBudgets', () => {
  it('splits the default total by family shares', () => {
    expect(resolve()).toEqual({
      offline: 600_000,
      password: 100_000,
      proxy: 200_000,
      replay: 100_000,
    });
    expect(resolve(' 1000 ', '')).toEqual({
      offline: 600,
      password: 100,
      proxy: 200,
      replay: 100,
    });
  });

  it('accepts explicit entries within the total', () => {
    expect(resolve('100000', 'replay=5, offline = 3')).toEqual({
      offline: 3,
      password: 10_000,
      proxy: 20_000,
      replay: 5,
    });
  });

  it.each([
    ['non-numeric total', 'abc', undefined],
    ['zero total', '0', undefined],
    ['negative total', '-5', undefined],
    ['fractional total', '1.5', undefined],
    ['exponent total', '1e6', undefined],
    ['oversized total', '99999999999', undefined],
    ['unknown family', '100000', 'offlin=10'],
    ['wrong-case family', '100000', 'Offline=10'],
    ['duplicate family', '100000', 'replay=5,replay=6'],
    ['non-numeric value', '100000', 'replay=x'],
    ['zero value', '100000', 'replay=0'],
    ['fractional value', '100000', 'replay=1.5'],
    ['missing value', '100000', 'replay'],
    ['empty entry', '100000', 'replay=5,'],
    ['entries above the total', '1000000', 'offline=999999'],
    ['a share rounding to zero', '5', undefined],
    ['total above the maximum', '1000000001', undefined],
    ['signed total', '+5', undefined],
    ['whitespace-only total', '   ', undefined],
    ['whitespace-only split', '100000', '  '],
    ['newline-separated entries', '100000', 'replay=5\noffline=3'],
    ['signed value', '100000', 'replay=+5'],
  ])('rejects a %s', (_, total, split) => {
    expect(resolve(total, split)).toBeNull();
  });
});
