import { describe, expect, it } from 'vitest';
import { storefrontPayloadSchema } from './schemas';

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
});
