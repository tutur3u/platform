import { describe, expect, it } from 'vitest';
import {
  isSelfServeWorkspaceProduct,
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
