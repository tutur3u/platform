import { describe, expect, it } from 'vitest';
import {
  formatStorefrontOrderStatus,
  getStorefrontOrderState,
} from './storefront-order-state';

const pendingOrder = {
  polarStatus: null,
  squareStatus: 'pending' as const,
  status: 'reserved' as const,
};

describe('storefront order presentation state', () => {
  it('keeps an active Square checkout pending', () => {
    expect(getStorefrontOrderState(pendingOrder)).toBe('pending');
  });

  it('shows confirmed only after the checkout or provider confirms payment', () => {
    expect(
      getStorefrontOrderState({
        ...pendingOrder,
        squareStatus: 'paid',
      })
    ).toBe('confirmed');
    expect(
      getStorefrontOrderState({
        polarStatus: null,
        squareStatus: null,
        status: 'completed',
      })
    ).toBe('confirmed');
  });

  it('surfaces provider failures instead of presenting a success state', () => {
    expect(
      getStorefrontOrderState({
        ...pendingOrder,
        squareStatus: 'failed',
      })
    ).toBe('needs_attention');
    expect(
      getStorefrontOrderState({
        polarStatus: 'expired',
        squareStatus: null,
        status: 'expired',
      })
    ).toBe('needs_attention');
  });

  it('formats machine statuses for the buyer-facing badge', () => {
    expect(
      formatStorefrontOrderStatus({
        ...pendingOrder,
        squareStatus: 'checkout_created',
      })
    ).toBe('checkout created');
  });
});
