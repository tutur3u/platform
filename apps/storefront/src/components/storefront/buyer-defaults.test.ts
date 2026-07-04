import { describe, expect, it } from 'vitest';
import { mapStorefrontBuyerDefaults } from './buyer-defaults';

describe('mapStorefrontBuyerDefaults', () => {
  it('prefers display name, then full name, then name, then email', () => {
    expect(
      mapStorefrontBuyerDefaults({
        display_name: ' Display Buyer ',
        email: ' buyer@example.com ',
        full_name: 'Full Buyer',
        name: 'Name Buyer',
      })
    ).toEqual({
      email: 'buyer@example.com',
      name: 'Display Buyer',
    });

    expect(
      mapStorefrontBuyerDefaults({
        display_name: ' ',
        email: 'buyer@example.com',
        full_name: 'Full Buyer',
        name: 'Name Buyer',
      })
    ).toEqual({
      email: 'buyer@example.com',
      name: 'Full Buyer',
    });

    expect(
      mapStorefrontBuyerDefaults({
        email: 'buyer@example.com',
        name: 'Name Buyer',
      })
    ).toEqual({
      email: 'buyer@example.com',
      name: 'Name Buyer',
    });
  });

  it('falls back to email for name and returns undefined for empty profiles', () => {
    expect(
      mapStorefrontBuyerDefaults({
        email: 'buyer@example.com',
      })
    ).toEqual({
      email: 'buyer@example.com',
      name: 'buyer@example.com',
    });

    expect(mapStorefrontBuyerDefaults(null)).toBeUndefined();
    expect(mapStorefrontBuyerDefaults({ email: ' ' })).toBeUndefined();
  });
});
