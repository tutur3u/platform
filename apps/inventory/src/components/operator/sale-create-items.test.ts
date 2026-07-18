import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getSaleStockOptions,
  type SaleStockOption,
  updateSaleCartQuantity,
} from './sale-create-items';

const option: SaleStockOption = {
  amount: 3,
  categoryId: null,
  categoryName: null,
  financeCategoryId: null,
  imageUrl: null,
  key: 'product-1:unit-1:warehouse-1',
  price: 8.1,
  productId: 'product-1',
  productName: 'Demo product',
  unitId: 'unit-1',
  unitName: 'Each',
  warehouseId: 'warehouse-1',
  warehouseName: 'Counter',
};

describe('getSaleStockOptions', () => {
  it('keeps exact decimal prices and every sellable stock location', () => {
    expect(
      getSaleStockOptions([
        {
          avatar_url: '/api/media/demo-product.webp',
          finance_category_id: 'category-1',
          id: 'product-1',
          inventory: [
            {
              amount: 4,
              price: 8.1,
              unit_id: 'unit-1',
              unit_name: 'Each',
              warehouse_id: 'warehouse-1',
              warehouse_name: 'Counter',
            },
          ],
          name: 'Demo product',
        },
      ])
    ).toEqual([
      expect.objectContaining({
        amount: 4,
        financeCategoryId: 'category-1',
        imageUrl: '/api/media/demo-product.webp',
        price: 8.1,
        unitName: 'Each',
        warehouseName: 'Counter',
      }),
    ]);
  });

  it('excludes archived products and incomplete stock targets', () => {
    expect(
      getSaleStockOptions([
        {
          archived: true,
          id: 'archived',
          inventory: [
            { price: 1, unit_id: 'unit-1', warehouse_id: 'warehouse-1' },
          ],
          name: 'Archived',
        },
        {
          id: 'incomplete',
          inventory: [{ price: 1, unit_id: 'unit-1' }],
          name: 'Incomplete',
        },
      ])
    ).toEqual([]);
  });
});

describe('updateSaleCartQuantity', () => {
  it('adds, updates, clamps, and removes a line from the item picker', () => {
    const added = updateSaleCartQuantity([], option, 1);
    expect(added).toEqual([{ ...option, quantity: 1 }]);

    const clamped = updateSaleCartQuantity(added, option, 8);
    expect(clamped[0]?.quantity).toBe(3);

    expect(updateSaleCartQuantity(clamped, option, 0)).toEqual([]);
  });
});

describe('CartEditor', () => {
  it('uses the shared localized currency input and compact mobile metadata', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, 'sale-create-items.tsx'),
      'utf8'
    );

    expect(source).toContain('<CurrencyInput');
    expect(source).toContain('getCurrencyLocale(currencyCode)');
    expect(source).toContain('getCurrencyFractionDigits(currencyCode)');
    expect(source).toContain('showUnitOnMobile');
    expect(source).toContain('showWarehouseOnMobile');
  });
});
