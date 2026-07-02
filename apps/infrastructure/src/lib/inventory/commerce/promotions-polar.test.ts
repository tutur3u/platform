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
        'usd',
        'product-1'
      )
    ).toEqual({
      basisPoints: 1000,
      code: 'SAVE10',
      duration: 'once',
      maxRedemptions: 100,
      name: 'Launch',
      products: ['product-1'],
      type: 'percentage',
    });
  });

  it('maps a fixed promotion to cents in the storefront currency', () => {
    expect(
      buildPolarDiscountInput(
        { code: 'FIVEOFF', name: 'Five off', use_ratio: false, value: 5 },
        'usd',
        'product-1'
      )
    ).toEqual({
      amount: 500,
      code: 'FIVEOFF',
      // Polar's SDK enum only accepts lowercase ISO codes.
      currency: 'usd',
      duration: 'once',
      maxRedemptions: null,
      name: 'Five off',
      products: ['product-1'],
      type: 'fixed',
    });
  });

  it('rounds percentage strings to Polar basis points', () => {
    expect(
      buildPolarDiscountInput(
        {
          code: 'SAVE12',
          max_uses: null,
          name: 'Decimal percent',
          use_ratio: true,
          value: '12.345',
        },
        'usd',
        'product-2'
      )
    ).toEqual({
      basisPoints: 1235,
      code: 'SAVE12',
      duration: 'once',
      maxRedemptions: null,
      name: 'Decimal percent',
      products: ['product-2'],
      type: 'percentage',
    });
  });

  it('rounds decimal fixed values to the nearest cent', () => {
    expect(
      buildPolarDiscountInput(
        {
          code: 'ROUND',
          max_uses: 1,
          name: 'Rounding',
          use_ratio: false,
          value: '19.995',
        },
        'eur',
        'product-3'
      )
    ).toEqual({
      amount: 2000,
      code: 'ROUND',
      currency: 'eur',
      duration: 'once',
      maxRedemptions: 1,
      name: 'Rounding',
      products: ['product-3'],
      type: 'fixed',
    });
  });

  it('treats missing max_uses as unlimited', () => {
    expect(
      buildPolarDiscountInput(
        { code: 'X', name: 'X', use_ratio: true, value: 25 },
        'eur',
        'product-4'
      ).maxRedemptions
    ).toBeNull();
  });

  it('always scopes discounts to the inventory checkout product', () => {
    expect(
      buildPolarDiscountInput(
        { code: 'SCOPE', name: 'Scoped', use_ratio: true, value: 25 },
        'usd',
        'polar-product-id'
      ).products
    ).toEqual(['polar-product-id']);
  });
});
