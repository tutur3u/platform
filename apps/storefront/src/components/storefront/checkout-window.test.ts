import { describe, expect, it, vi } from 'vitest';
import {
  openHostedPolarCheckout,
  openSquarePosCheckout,
} from './checkout-window';

const launch = {
  androidUrl: 'intent:#Intent;end',
  fallbackUrl: 'https://store.tuturuuu.com/shop/orders/order-1',
  iosUrl: 'square-commerce-v1://payment/create?data=test',
};

describe('storefront checkout navigation', () => {
  it('opens hosted checkout once in the same tab', () => {
    const assign = vi.fn();
    expect(
      openHostedPolarCheckout('https://polar.sh/checkout', { assign })
    ).toBe('same-tab');
    expect(assign).toHaveBeenCalledOnce();
  });

  it.each([
    ['Android', 'Mozilla/5.0 (Linux; Android 16)', launch.androidUrl],
    ['iOS', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5)', launch.iosUrl],
  ])('opens Square POS on %s', (_platform, userAgent, expected) => {
    const assign = vi.fn();
    openSquarePosCheckout(launch, { assign, userAgent });
    expect(assign).toHaveBeenCalledWith(expected);
  });

  it('shows the reserved order on unsupported desktop devices', () => {
    const assign = vi.fn();
    expect(
      openSquarePosCheckout(launch, {
        assign,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      })
    ).toBe('unsupported');
    expect(assign).toHaveBeenCalledWith(launch.fallbackUrl);
  });
});
