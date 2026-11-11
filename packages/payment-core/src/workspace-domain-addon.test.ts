import type { Subscription } from '@tuturuuu/payment/polar';
import { describe, expect, it } from 'vitest';
import { isCustomDomainAddonProduct } from './polar-product-metadata';
import { domainAddonQuantity } from './workspace-domain-addon';

describe('custom domain add-on', () => {
  it('is identified by product metadata only', () => {
    expect(
      isCustomDomainAddonProduct({ product_kind: 'custom_domain_addon' })
    ).toBe(true);
    expect(
      isCustomDomainAddonProduct({ product_kind: ' Custom_Domain_Addon ' })
    ).toBe(true);
    expect(isCustomDomainAddonProduct({ product_tier: 'PRO' })).toBe(false);
    expect(isCustomDomainAddonProduct({})).toBe(false);
  });

  it('maps seats to domain units', () => {
    const sub = (seats: unknown) => ({ seats }) as unknown as Subscription;
    expect(domainAddonQuantity(sub(3))).toBe(3);
    expect(domainAddonQuantity(sub(0))).toBe(0);
    expect(domainAddonQuantity(sub(5000))).toBe(1000);
    expect(domainAddonQuantity(sub(null))).toBe(1);
    expect(domainAddonQuantity(sub(1.5))).toBe(1);
  });
});
