import { describe, expect, it, vi } from 'vitest';
import {
  HOSTED_POLAR_CHECKOUT_FEATURES,
  HOSTED_POLAR_CHECKOUT_TARGET,
  openHostedPolarCheckout,
} from './checkout-window';

describe('openHostedPolarCheckout', () => {
  it('opens hosted Polar checkout in a normal browser tab', () => {
    const checkoutUrl = 'https://checkout.polar.sh/session/test';
    const focus = vi.fn();
    const open = vi.fn<
      (url: string, target: string, features: string) => { focus: () => void }
    >(() => ({ focus }));
    const assign = vi.fn();

    const result = openHostedPolarCheckout(checkoutUrl, { assign, open });

    expect(result).toBe('new-tab');
    expect(open).toHaveBeenCalledWith(
      checkoutUrl,
      HOSTED_POLAR_CHECKOUT_TARGET,
      HOSTED_POLAR_CHECKOUT_FEATURES
    );
    expect(open.mock.calls[0]?.[2]).not.toContain('popup');
    expect(open.mock.calls[0]?.[2]).not.toContain('width=');
    expect(open.mock.calls[0]?.[2]).not.toContain('height=');
    expect(focus).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls back to same-tab checkout when the new tab is blocked', () => {
    const checkoutUrl = 'https://checkout.polar.sh/session/test';
    const open = vi.fn<(url: string, target: string, features: string) => null>(
      () => null
    );
    const assign = vi.fn();

    const result = openHostedPolarCheckout(checkoutUrl, { assign, open });

    expect(result).toBe('same-tab');
    expect(open).toHaveBeenCalledWith(
      checkoutUrl,
      HOSTED_POLAR_CHECKOUT_TARGET,
      HOSTED_POLAR_CHECKOUT_FEATURES
    );
    expect(assign).toHaveBeenCalledWith(checkoutUrl);
  });
});
