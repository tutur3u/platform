import { describe, expect, it } from 'vitest';
import { getDefaultStorefrontSlug } from './auto-listing-slug';

describe('getDefaultStorefrontSlug', () => {
  it('creates stable workspace-scoped public slugs', () => {
    expect(
      getDefaultStorefrontSlug('bf2c1c8d-e20b-46d6-a68d-f7fc13768ecf')
    ).toBe('store-bf2c1c8de20b');
    expect(
      getDefaultStorefrontSlug('11111111-1111-4111-8111-111111111111')
    ).not.toBe(
      getDefaultStorefrontSlug('22222222-2222-4222-8222-222222222222')
    );
  });
});
