import { describe, expect, it } from 'vitest';
import {
  getPreferredListingStock,
  getStockPriceMinor,
} from './storefront-listing-pricing';

describe('storefront listing stock pricing', () => {
  it('prefers a sellable stock row and converts its major price to minor units', () => {
    const product = {
      id: 'product-1',
      name: 'Print',
      inventory: [
        { amount: 0, price: 12.5, unit_id: 'u-1', warehouse_id: 'w-1' },
        { amount: 3, price: 10.81, unit_id: 'u-2', warehouse_id: 'w-2' },
      ],
    };
    expect(getPreferredListingStock(product)).toMatchObject({
      price: 10.81,
      unitId: 'u-2',
      warehouseId: 'w-2',
    });
    expect(getStockPriceMinor(product, 'USD')).toBe(1081);
  });

  it('keeps zero-decimal storefront currencies exact', () => {
    const product = {
      id: 'product-1',
      name: 'Poster',
      inventory: [
        { amount: null, price: 185000, unit_id: 'u-1', warehouse_id: 'w-1' },
      ],
    };
    expect(getStockPriceMinor(product, 'VND')).toBe(185000);
  });

  it('rejects incomplete stock rows', () => {
    expect(
      getPreferredListingStock({
        id: 'product-1',
        name: 'Incomplete',
        inventory: [{ amount: 1, price: 5, unit_id: '', warehouse_id: 'w-1' }],
      })
    ).toBeNull();
  });
});
