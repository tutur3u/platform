import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { collectHybridSearchResults } from './hybrid-search';
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

  it.each(['', 'Demo'])(
    'collapses overlapping pages for query %j without merging warehouse/unit variants',
    (query) => {
      const first: InventoryProductSummary = {
        id: 'product-1',
        name: 'Demo product',
        inventory: [
          {
            amount: 4,
            price: 8.1,
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-1',
          },
        ],
      };
      const refreshed: InventoryProductSummary = {
        ...first,
        inventory: [
          {
            amount: 3,
            price: 7.2,
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-1',
          },
          {
            amount: 3,
            price: 7.2,
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-1',
          },
          {
            amount: null,
            price: 8.1,
            unit_id: 'unit-2',
            warehouse_id: 'warehouse-1',
          },
          {
            amount: 0,
            price: 8.1,
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-2',
          },
        ],
      };
      const pages = [{ data: [first] }, { data: [refreshed] }];
      const visibleItems = pages.flatMap((page) => page.data);
      const products = collectHybridSearchResults({
        entries: [],
        getId: (product: InventoryProductSummary) => product.id,
        query,
        visibleItems,
      });
      const options = getSaleStockOptions(products);
      expect(options.map((row) => [row.key, row.amount])).toEqual([
        ['product-1:unit-1:warehouse-1', 3],
        ['product-1:unit-2:warehouse-1', null],
        ['product-1:unit-1:warehouse-2', 0],
      ]);
      const cart = updateSaleCartQuantity(
        updateSaleCartQuantity([], options[0]!, 1),
        options[0]!,
        2
      );
      expect(options[0]?.price).toBe(7.2);
      expect(cart).toHaveLength(1);
      expect(cart[0]?.quantity).toBe(2);
      expect(first.inventory?.[0]?.amount).toBe(4);
      expect(refreshed.inventory).toHaveLength(4);
    }
  );

  it('keeps distinct product IDs with the same name and honors a refreshed archive', () => {
    const product: InventoryProductSummary = {
      id: 'first',
      name: 'Same name',
      inventory: [{ unit_id: 'unit', warehouse_id: 'warehouse', price: 1 }],
    };
    expect(
      getSaleStockOptions([product, { ...product, id: 'second' }]).map(
        (row) => row.productId
      )
    ).toEqual(['first', 'second']);
    expect(
      getSaleStockOptions([product, { ...product, archived: true }])
    ).toEqual([]);
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
