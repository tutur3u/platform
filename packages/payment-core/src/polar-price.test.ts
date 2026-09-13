import type { Product } from '@tuturuuu/payment/polar';
import { describe, expect, it } from 'vitest';
import { getSupportedProductPrice } from './polar-price';

const product = (prices: unknown[]) => ({ id: 'product', prices }) as Product;
const fixed = {
  amountType: 'fixed',
  priceAmount: 900,
  priceCurrency: 'usd',
  isArchived: false,
};
const seat = {
  amountType: 'seat_based',
  priceCurrency: 'usd',
  isArchived: false,
  seatTiers: {
    minimumSeats: 1,
    maximumSeats: null,
    tiers: [{ minSeats: 1, maxSeats: null, pricePerSeat: 900 }],
  },
};

describe('Polar product price mapping', () => {
  it('maps seat pricing without a priceAmount field', () => {
    expect(getSupportedProductPrice(product([seat]))).toMatchObject({
      amount: null,
      pricePerSeat: 900,
      minSeats: 1,
      maxSeats: null,
    });
  });
  it('ignores archived prices and accepts a free price without an amount', () => {
    expect(
      getSupportedProductPrice(
        product([
          { ...fixed, isArchived: true },
          { amountType: 'free', isArchived: false },
        ])
      ).amount
    ).toBe(0);
  });
  it('rejects ambiguous, foreign-currency and graduated prices instead of silently misquoting', () => {
    expect(() => getSupportedProductPrice(product([fixed, seat]))).toThrow(
      'exactly one'
    );
    expect(() =>
      getSupportedProductPrice(product([{ ...fixed, priceCurrency: 'eur' }]))
    ).toThrow('USD');
    expect(() =>
      getSupportedProductPrice(
        product([
          {
            ...seat,
            seatTiers: {
              ...seat.seatTiers,
              tiers: [...seat.seatTiers.tiers, ...seat.seatTiers.tiers],
            },
          },
        ])
      )
    ).toThrow('graduated');
  });
});
