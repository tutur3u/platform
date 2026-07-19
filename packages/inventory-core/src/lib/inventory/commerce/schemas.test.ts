import { describe, expect, it } from 'vitest';
import {
  squareSettingsPayloadSchema,
  storefrontPayloadSchema,
} from './schemas';

const baseStorefrontPayload = {
  name: 'Preview Store',
  sections: [
    {
      href: 'https://example.com/promo',
      sectionType: 'promo',
      status: 'published',
      title: 'Promo',
    },
  ],
  slug: 'preview-store',
};

describe('storefrontPayloadSchema', () => {
  it('accepts http and https storefront section links', () => {
    expect(
      storefrontPayloadSchema.safeParse(baseStorefrontPayload).success
    ).toBe(true);
    expect(
      storefrontPayloadSchema.safeParse({
        ...baseStorefrontPayload,
        sections: [
          {
            href: 'http://example.com/promo',
            sectionType: 'promo',
          },
        ],
      }).success
    ).toBe(true);
  });

  it('rejects JavaScript storefront section links', () => {
    expect(
      storefrontPayloadSchema.safeParse({
        ...baseStorefrontPayload,
        sections: [
          {
            href: 'javascript:alert(document.domain)',
            sectionType: 'promo',
          },
        ],
      }).success
    ).toBe(false);
  });

  it('rejects JavaScript storefront section item links', () => {
    expect(
      storefrontPayloadSchema.safeParse({
        ...baseStorefrontPayload,
        sections: [
          {
            items: [
              {
                href: 'javascript:alert(document.domain)',
                title: 'Unsafe item',
              },
            ],
            sectionType: 'featured_banners',
          },
        ],
      }).success
    ).toBe(false);
  });

  it('accepts Square Terminal as a first-class checkout mode', () => {
    expect(
      storefrontPayloadSchema.safeParse({
        ...baseStorefrontPayload,
        checkoutMode: 'square_terminal',
      }).success
    ).toBe(true);
  });

  it('accepts Square POS app checkout for phone-connected Readers', () => {
    expect(
      storefrontPayloadSchema.safeParse({
        ...baseStorefrontPayload,
        checkoutMode: 'square_pos',
      }).success
    ).toBe(true);
  });
});

describe('squareSettingsPayloadSchema', () => {
  it('requires a Square environment when saving manual credentials', () => {
    expect(
      squareSettingsPayloadSchema.safeParse({
        accessToken: 'EAAAE.square-token',
      }).success
    ).toBe(false);

    expect(
      squareSettingsPayloadSchema.safeParse({
        accessToken: 'EAAAE.square-token',
        environment: 'sandbox',
        webhookSignatureKey: 'sq-webhook-key',
      }).success
    ).toBe(true);
  });
});
