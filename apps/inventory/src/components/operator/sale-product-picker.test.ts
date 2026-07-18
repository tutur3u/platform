import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SaleStockOption } from './sale-create-items';
import { sortSaleStockOptions } from './sale-product-picker';

function option(name: string, price: number): SaleStockOption {
  return {
    amount: null,
    categoryId: null,
    categoryName: null,
    financeCategoryId: null,
    imageUrl: null,
    key: name,
    price,
    productId: name,
    productName: name,
    unitId: 'unit',
    unitName: 'Each',
    warehouseId: 'warehouse',
    warehouseName: 'Counter',
  };
}

describe('sortSaleStockOptions', () => {
  const options = [option('Beta', 2), option('Alpha', 4)];

  it('sorts by product name without mutating cached results', () => {
    expect(
      sortSaleStockOptions(options, 'name-asc').map((item) => item.productName)
    ).toEqual(['Alpha', 'Beta']);
    expect(options.map((item) => item.productName)).toEqual(['Beta', 'Alpha']);
  });

  it('sorts by price in either direction', () => {
    expect(
      sortSaleStockOptions(options, 'price-asc').map((item) => item.price)
    ).toEqual([2, 4]);
    expect(
      sortSaleStockOptions(options, 'price-desc').map((item) => item.price)
    ).toEqual([4, 2]);
  });

  it('keeps redundant mobile metadata optional and unlimited stock compact', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'sale-product-picker.tsx'),
      'utf8'
    );

    expect(source).toContain('showUnitOnMobile');
    expect(source).toContain('showWarehouseOnMobile');
    expect(source).toContain('∞');
    expect(source).toContain('sm:h-10');
  });
});
