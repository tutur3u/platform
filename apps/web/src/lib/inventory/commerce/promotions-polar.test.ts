import { describe, expect, it } from 'vitest';
import { buildPolarDiscountInput } from './promotions-polar';

describe('buildPolarDiscountInput', () => {
  it('maps a percentage promotion to basis points', () => {
    expect(
      buildPolarDiscountInput(
        {
          code: 'SAVE10',
          max_uses: 100,
          name: 'Launch',
          use_ratio: true,
          value: 10,
        },
        'usd'
      )
    ).toEqual({
      basisPoints: 1000,
      code: 'SAVE10',
      duration: 'once',
      maxRedemptions: 100,
      name: 'Launch',
      type: 'percentage',
    });
  });

  it('maps a fixed promotion to cents in the storefront currency', () => {
    expect(
      buildPolarDiscountInput(
        { code: 'FIVEOFF', name: 'Five off', use_ratio: false, value: 5 },
        'usd'
      )
    ).toEqual({
      amount: 500,
      code: 'FIVEOFF',
      currency: 'USD',
      duration: 'once',
      maxRedemptions: null,
      name: 'Five off',
      type: 'fixed',
    });
  });

  it('treats missing max_uses as unlimited', () => {
    expect(
      buildPolarDiscountInput(
        { code: 'X', name: 'X', use_ratio: true, value: 25 },
        'eur'
      ).maxRedemptions
    ).toBeNull();
  });
});
