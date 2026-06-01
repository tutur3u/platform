import { describe, expect, it, vi } from 'vitest';
import { validateInventoryItemWorkspaceRelations } from './relation-validation';

function createRelationClient({
  unitRows,
  warehouseRows,
}: {
  unitRows: Array<{ id: string }>;
  warehouseRows: Array<{ id: string }>;
}) {
  const calls: Array<{
    ids: string[];
    table: string;
    wsId: string;
  }> = [];

  const from = vi.fn((table: string) => {
    const query = {
      eq: vi.fn((_column: string, wsId: string) => ({
        in: vi.fn((_column: string, ids: string[]) => {
          calls.push({ table, wsId, ids });

          return Promise.resolve({
            data: table === 'inventory_units' ? unitRows : warehouseRows,
            error: null,
          });
        }),
      })),
      select: vi.fn(() => query),
    };

    return query;
  });

  return {
    calls,
    client: { from },
    from,
  };
}

describe('inventory relation validation', () => {
  it('requires every unit and warehouse to belong to the route workspace', async () => {
    const mocks = createRelationClient({
      unitRows: [{ id: 'unit-1' }],
      warehouseRows: [{ id: 'warehouse-1' }],
    });

    await expect(
      validateInventoryItemWorkspaceRelations({
        inventoryClient: mocks.client as never,
        wsId: 'ws-1',
        inventory: [
          {
            unit_id: 'unit-1',
            warehouse_id: 'warehouse-1',
          },
        ],
      })
    ).resolves.toEqual({ ok: true });

    expect(mocks.calls).toEqual([
      {
        table: 'inventory_units',
        wsId: 'ws-1',
        ids: ['unit-1'],
      },
      {
        table: 'inventory_warehouses',
        wsId: 'ws-1',
        ids: ['warehouse-1'],
      },
    ]);
  });

  it('rejects inventory items with units outside the route workspace', async () => {
    const mocks = createRelationClient({
      unitRows: [],
      warehouseRows: [{ id: 'warehouse-1' }],
    });

    await expect(
      validateInventoryItemWorkspaceRelations({
        inventoryClient: mocks.client as never,
        wsId: 'ws-1',
        inventory: [
          {
            unit_id: 'unit-from-other-workspace',
            warehouse_id: 'warehouse-1',
          },
        ],
      })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Invalid inventory unit',
    });
  });
});
