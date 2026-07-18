import { describe, expect, it } from 'vitest';
import {
  buildBulkInventoryUpdates,
  type ProductBulkSelection,
} from './product-bulk-update';

function selection(
  inventory: Array<Record<string, unknown>>,
  inventoryIndex = 0
): ProductBulkSelection {
  return {
    inventoryIndex,
    key: `product-1:${inventoryIndex}`,
    product: {
      id: 'product-1',
      inventory,
      name: 'Demo product',
    },
  };
}

describe('product bulk inventory updates', () => {
  it('sets an exact quantity and warehouse while preserving row metadata', () => {
    const updates = buildBulkInventoryUpdates(
      [
        selection([
          {
            amount: 5,
            min_amount: 2,
            price: 8.19,
            revenue_share_bps: 1500,
            revenue_share_partner_id: 'owner-1',
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-1',
          },
        ]),
      ],
      { amount: 12, warehouseId: 'warehouse-2' }
    );

    expect(updates.get('product-1')).toEqual([
      {
        amount: 12,
        min_amount: 2,
        price: 8.19,
        revenue_share_bps: 1500,
        revenue_share_partner_id: 'owner-1',
        unit_id: 'unit-1',
        warehouse_id: 'warehouse-2',
      },
    ]);
  });

  it('supports unlimited stock as a null quantity', () => {
    const updates = buildBulkInventoryUpdates(
      [
        selection([
          {
            amount: 5,
            price: 10,
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-1',
          },
        ]),
      ],
      { amount: null }
    );

    expect(updates.get('product-1')?.[0]?.amount).toBeNull();
  });

  it('rejects warehouse moves that would create duplicate stock targets', () => {
    const rows = [
      {
        amount: 5,
        price: 10,
        unit_id: 'unit-1',
        warehouse_id: 'warehouse-1',
      },
      {
        amount: 3,
        price: 10,
        unit_id: 'unit-1',
        warehouse_id: 'warehouse-2',
      },
    ];

    expect(() =>
      buildBulkInventoryUpdates([selection(rows)], {
        warehouseId: 'warehouse-2',
      })
    ).toThrow('duplicate_stock_target');
  });
});
