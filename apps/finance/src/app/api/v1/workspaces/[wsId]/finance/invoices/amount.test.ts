import { describe, expect, it } from 'vitest';
import {
  calculateCustomInvoiceSubtotal,
  normalizeInvoiceStoredAmount,
  resolveCustomInvoicePricing,
} from './amount';

describe('normalizeInvoiceStoredAmount', () => {
  it('preserves cent-level prices', () => {
    expect(normalizeInvoiceStoredAmount(8.1)).toBe(8.1);
    expect(normalizeInvoiceStoredAmount(10.81)).toBe(10.81);
  });

  it('preserves supported sub-cent precision and removes floating noise', () => {
    expect(normalizeInvoiceStoredAmount(1.2345674)).toBe(1.234567);
    expect(normalizeInvoiceStoredAmount(0.1 + 0.2)).toBe(0.3);
  });

  it('uses operator-entered line prices for a custom-price invoice', () => {
    expect(
      calculateCustomInvoiceSubtotal([
        { price: 120_000, quantity: 1 },
        { price: 10.81, quantity: 2 },
      ])
    ).toBe(120_021.62);
  });

  it('rejects invalid custom prices and quantities', () => {
    expect(() =>
      calculateCustomInvoiceSubtotal([{ price: -1, quantity: 1 }])
    ).toThrow(RangeError);
    expect(() =>
      calculateCustomInvoiceSubtotal([{ price: 1, quantity: 0 }])
    ).toThrow(RangeError);
  });

  it('keeps catalog pricing on the server calculation path', () => {
    expect(
      resolveCustomInvoicePricing({
        priceMode: 'catalog',
        products: [{ price: 80, quantity: 1 }],
      })
    ).toEqual({ ok: true, values: null });
  });

  it('rejects promotions with operator-entered prices', () => {
    expect(
      resolveCustomInvoicePricing({
        priceMode: 'custom',
        products: [{ price: 80, quantity: 1 }],
        promotionId: 'promotion-1',
      })
    ).toEqual({
      message: 'Custom invoice prices cannot be combined with promotions',
      ok: false,
    });
  });
});
