import { describe, expect, it, vi } from 'vitest';
import { openHostedPolarCheckout } from './checkout-window';

describe('openHostedPolarCheckout', () => {
  it('navigates once in the current tab to avoid duplicate checkout tabs', () => {
    const checkoutUrl = 'https://checkout.polar.sh/session/test';
    const assign = vi.fn();

    const result = openHostedPolarCheckout(checkoutUrl, { assign });

    expect(result).toBe('same-tab');
    expect(assign).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith(checkoutUrl);
  });
});
