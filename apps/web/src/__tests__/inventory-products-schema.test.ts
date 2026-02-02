import { describe, expect, it } from 'vitest';
import { EditProductSchema } from '../app/[locale]/(dashboard)/[wsId]/inventory/products/quick-dialog-components/schema';

describe('inventory product schema', () => {
  it('accepts unlimited stock with unit, warehouse, and price', () => {
    const result = EditProductSchema.safeParse({
      name: 'Widget',
      inventory: [
        {
          unit_id: 'unit-1',
          warehouse_id: 'warehouse-1',
          amount: null,
          min_amount: 0,
          price: 100,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects duplicate warehouse and unit combinations', () => {
    const result = EditProductSchema.safeParse({
      name: 'Widget',
      inventory: [
        {
          unit_id: 'unit-1',
          warehouse_id: 'warehouse-1',
          amount: 5,
          min_amount: 0,
          price: 100,
        },
        {
          unit_id: 'unit-1',
          warehouse_id: 'warehouse-1',
          amount: 10,
          min_amount: 0,
          price: 120,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('requires unit, warehouse, and price', () => {
    const result = EditProductSchema.safeParse({
      name: 'Widget',
      inventory: [
        {
          unit_id: '',
          warehouse_id: '',
          amount: null,
          min_amount: 0,
          price: 0,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
