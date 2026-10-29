import { describe, expect, it } from 'vitest';
import { hasLinkedProductInWorkspace } from './linked-product-scope';

type Lookup = { schema: string; table: string; filters: [string, string][] };

function fakeClient(missingTable?: string) {
  const lookups: Lookup[] = [];
  const builder = (schema: string) => ({
    from(table: string) {
      const lookup: Lookup = { schema, table, filters: [] };
      lookups.push(lookup);
      const query = {
        select: () => query,
        eq(column: string, value: string) {
          lookup.filters.push([column, value]);
          return query;
        },
        maybeSingle: async () => ({
          data: table === missingTable ? null : { id: 'row' },
          error: null,
        }),
      };
      return query;
    },
  });
  return {
    lookups,
    client: { ...builder('public'), schema: builder } as never,
  };
}

const ids = {
  wsId: 'ws-1',
  productId: 'product-1',
  warehouseId: 'warehouse-1',
  unitId: 'unit-1',
};

describe('hasLinkedProductInWorkspace', () => {
  it('scopes every lookup to the workspace and reads inventory from private', async () => {
    const { client, lookups } = fakeClient();

    await expect(
      hasLinkedProductInWorkspace({ sbAdmin: client, ...ids })
    ).resolves.toBe(true);

    expect(
      lookups.map(({ schema, table, filters }) => [schema, table, filters])
    ).toEqual([
      [
        'public',
        'workspace_products',
        [
          ['id', 'product-1'],
          ['ws_id', 'ws-1'],
        ],
      ],
      [
        'private',
        'inventory_warehouses',
        [
          ['id', 'warehouse-1'],
          ['ws_id', 'ws-1'],
        ],
      ],
      [
        'private',
        'inventory_units',
        [
          ['id', 'unit-1'],
          ['ws_id', 'ws-1'],
        ],
      ],
      [
        'private',
        'inventory_products',
        [
          ['product_id', 'product-1'],
          ['warehouse_id', 'warehouse-1'],
          ['unit_id', 'unit-1'],
        ],
      ],
    ]);
  });

  it('rejects a link when any scoped row is missing', async () => {
    const { client } = fakeClient('inventory_units');

    await expect(
      hasLinkedProductInWorkspace({ sbAdmin: client, ...ids })
    ).resolves.toBe(false);
  });
});
