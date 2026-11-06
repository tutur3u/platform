import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/user-groups/revalidate', () => ({
  revalidateUserGroupCache: mocks.revalidate,
}));

import { DELETE, PATCH } from './route';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let writes: string[];
const reads: string[] = [];
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let operation = '';
  const result = () => {
    if (operation) writes.push(`${table}:${operation}`);
    return { data: rows, error: null, count: rows.length };
  };
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      rows = rows.filter((row) => row[key] === value);
      return q;
    },
    order: () => q,
    range: () => q,
    limit: () => q,
    insert: (row: Row) => {
      operation = 'insert';
      rows = [{ id: 'new', ...row }];
      return q;
    },
    update: () => {
      operation = 'update';
      return q;
    },
    delete: () => {
      operation = 'delete';
      return q;
    },
    maybeSingle: async () => ({ ...result(), data: rows[0] ?? null }),
    single: async () => ({ ...result(), data: rows[0] ?? null }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase queries are awaitable.
    then: (resolve: (value: ReturnType<typeof result>) => unknown) =>
      Promise.resolve(resolve(result())),
  };
  return q;
}
const client = {
  from: vi.fn((table: string) => {
    reads.push(table);
    return query(table);
  }),
  schema: (_name: string) => client,
};

function call(
  method: 'PATCH' | 'DELETE',
  groupId = 'group-a',
  warehouseId = 'warehouse-a',
  unitId = 'unit-a'
) {
  return { PATCH, DELETE }[method](
    new Request('https://example.invalid/products', {
      method,
      ...(method === 'PATCH'
        ? { body: JSON.stringify({ warehouseId, unitId }) }
        : {}),
    }),
    {
      params: Promise.resolve({
        wsId: 'personal',
        groupId,
        productId: 'product-a',
      }),
    }
  );
}
describe('inventory group product workspace scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes = [];
    reads.length = 0;
    tables = {
      workspace_user_groups: [
        { id: 'group-a', ws_id: 'ws-a' },
        { id: 'group-b', ws_id: 'ws-b' },
      ],
      inventory_warehouses: [
        { id: 'warehouse-a', ws_id: 'ws-a' },
        { id: 'warehouse-b', ws_id: 'ws-b' },
      ],
      inventory_units: [
        { id: 'unit-a', ws_id: 'ws-a' },
        { id: 'unit-b', ws_id: 'ws-b' },
      ],
      user_group_linked_products: [
        { group_id: 'group-a', product_id: 'product-a' },
        { group_id: 'group-b', product_id: 'product-a' },
      ],
    };
    mocks.admin.mockResolvedValue(client);
    mocks.auth.mockResolvedValue({
      ok: true,
      value: { permissions: { wsId: 'ws-a', withoutPermission: () => false } },
    });
  });
  it.each(['PATCH', 'DELETE'] as const)(
    '%s rejects a foreign group before writing',
    async (method) => {
      expect((await call(method, 'group-b')).status).toBe(404);
      expect(writes).toEqual([]);
      expect(mocks.revalidate).not.toHaveBeenCalled();
    }
  );
  it.each([
    ['warehouse-b', 'unit-a'],
    ['warehouse-a', 'unit-b'],
  ])('rejects foreign stock references', async (warehouse, unit) => {
    expect((await call('PATCH', 'group-a', warehouse, unit)).status).toBe(404);
    expect(writes).toEqual([]);
  });
  it.each(['PATCH', 'DELETE'] as const)(
    '%s preserves authorized updates with normalized workspace',
    async (method) => {
      expect((await call(method)).status).toBe(200);
      expect(writes).toEqual([
        `user_group_linked_products:${method === 'PATCH' ? 'update' : 'delete'}`,
      ]);
    }
  );
});
