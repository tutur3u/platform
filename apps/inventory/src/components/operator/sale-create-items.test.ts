import { describe, expect, it } from 'vitest';
import { getSaleStockOptions } from './sale-create-items';

describe('getSaleStockOptions', () => {
  it('keeps exact decimal prices and every sellable stock location', () => {
    expect(
      getSaleStockOptions([
        {
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
