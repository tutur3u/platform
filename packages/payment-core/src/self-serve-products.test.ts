import { describe, expect, it } from 'vitest';
import {
  getSelfServePlanChangeError,
  isSelfServeWorkspaceProduct,
  resolveSelfServeSeatCount,
  validCheckoutSeats,
} from './self-serve-products';

describe('self-serve product policy', () => {
  it('keeps legacy fixed plans out of new purchases without excluding personal seats', () => {
    expect(
      isSelfServeWorkspaceProduct({
        tier: 'PLUS',
        pricing_model: 'fixed',
        archived: false,
      })
    ).toBe(false);
    expect(
      isSelfServeWorkspaceProduct({
        tier: 'PLUS',
        pricing_model: 'seat_based',
        archived: false,
      })
    ).toBe(true);
    expect(
      isSelfServeWorkspaceProduct({
        tier: 'PRO',
        pricing_model: 'seat_based',
        archived: true,
      })
    ).toBe(false);
    expect(
      isSelfServeWorkspaceProduct({
        tier: 'FREE',
        pricing_model: 'free',
        archived: false,
      })
    ).toBe(true);
    expect(
      isSelfServeWorkspaceProduct({
        tier: 'ENTERPRISE',
        pricing_model: 'seat_based',
        archived: false,
      })
    ).toBe(false);
  });
  it('never presents a positive fixed price as a Free plan', () => {
    for (const price of [undefined, null, 100, -1])
      expect(
        isSelfServeWorkspaceProduct({
          tier: 'FREE',
          pricing_model: 'fixed',
          archived: false,
          price,
        })
      ).toBe(false);
    expect(
      isSelfServeWorkspaceProduct({
        tier: 'FREE',
        pricing_model: 'fixed',
        archived: false,
        price: 0,
      })
    ).toBe(true);
  });
  it('requires an exact positive bounded seat count', () => {
    for (const count of [null, 0, -1, 1.5, NaN, Infinity, 1001])
      expect(validCheckoutSeats(count)).toBe(false);
    for (const count of [1, 5, 1000])
      expect(validCheckoutSeats(count)).toBe(true);
  });
});

describe('shared transition policy', () => {
  it('requires cancellation for every paid-to-Free path', () => {
    for (const tier of ['PLUS', 'PRO', 'ENTERPRISE', null])
      expect(getSelfServePlanChangeError(tier, 'FREE')).toContain(
        'Cancel at period end'
      );
    expect(getSelfServePlanChangeError('FREE', 'PLUS')).toBeNull();
    expect(getSelfServePlanChangeError('PLUS', 'PRO')).toBeNull();
  });
  it('preserves capacity and enforces the target bounds', () => {
    const base = {
      currentSeats: 3,
      memberCount: 2,
      minSeats: 5,
      maxSeats: null,
    };
    expect(resolveSelfServeSeatCount(base)).toBe(5);
    expect(resolveSelfServeSeatCount({ ...base, currentSeats: 8 })).toBe(8);
    expect(resolveSelfServeSeatCount({ ...base, memberCount: 9 })).toBe(9);
    for (const override of [
      { memberCount: null },
      { currentSeats: null },
      { minSeats: -1 },
      { maxSeats: 4 },
      { maxSeats: 1001 },
    ])
      expect(resolveSelfServeSeatCount({ ...base, ...override })).toBeNull();
  });
});
