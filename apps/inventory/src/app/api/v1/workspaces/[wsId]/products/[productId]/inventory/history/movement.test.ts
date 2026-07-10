import { describe, expect, it } from 'vitest';
import { mapStockMovement, type RawStockMovement } from './movement';

const baseMovement: RawStockMovement = {
  amount: 4,
  beneficiary: {
    display_name: 'Ada',
    email: 'ada@example.com',
    full_name: 'Ada Lovelace',
    id: 'beneficiary-1',
  },
  beneficiary_id: 'beneficiary-1',
  created_at: '2026-07-10T02:00:00.000Z',
  creator_id: 'operator-1',
  id: 'movement-1',
  note: 'Cycle count',
  operator: {
    display_name: 'Grace',
    email: 'grace@example.com',
    full_name: null,
    id: 'operator-1',
  },
  unit: { id: 'unit-1', name: 'Box' },
  unit_id: 'unit-1',
  warehouse: { id: 'warehouse-1', name: 'Main warehouse' },
  warehouse_id: 'warehouse-1',
};

describe('stock movement mapping', () => {
  it('maps an added movement and its related labels', () => {
    expect(mapStockMovement(baseMovement)).toEqual({
      beneficiary: {
        email: 'ada@example.com',
        id: 'beneficiary-1',
        name: 'Ada Lovelace',
      },
      beneficiaryId: 'beneficiary-1',
      delta: 4,
      direction: 'added',
      id: 'movement-1',
      note: 'Cycle count',
      operator: {
        email: 'grace@example.com',
        id: 'operator-1',
        name: 'Grace',
      },
      operatorId: 'operator-1',
      quantity: 4,
      timestamp: '2026-07-10T02:00:00.000Z',
      unit: { id: 'unit-1', name: 'Box' },
      unitId: 'unit-1',
      warehouse: { id: 'warehouse-1', name: 'Main warehouse' },
      warehouseId: 'warehouse-1',
    });
  });

  it('maps removals and preserves ids when related records are unavailable', () => {
    expect(
      mapStockMovement({
        ...baseMovement,
        amount: -3,
        beneficiary: null,
        operator: [],
        unit: null,
        warehouse: [],
      })
    ).toMatchObject({
      beneficiary: null,
      beneficiaryId: 'beneficiary-1',
      delta: -3,
      direction: 'removed',
      operator: null,
      operatorId: 'operator-1',
      quantity: 3,
      unit: null,
      unitId: 'unit-1',
      warehouse: null,
      warehouseId: 'warehouse-1',
    });
  });
});
