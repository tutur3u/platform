import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function createSelectClient(data: unknown[]) {
  const range = vi
    .fn()
    .mockResolvedValue({ count: data.length, data, error: null });
  const eq = vi.fn(() => ({ range }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    eq,
    from,
    range,
    schema,
    select,
  };
}

const routes = [
  {
    importRoute: () => import('./product-prices/route'),
    table: 'inventory_products',
    wsColumn: 'workspace_products.ws_id',
  },
  {
    importRoute: () => import('./product-units/route'),
    table: 'inventory_units',
    wsColumn: 'ws_id',
  },
  {
    importRoute: () => import('./warehouses/route'),
    table: 'inventory_warehouses',
    wsColumn: 'ws_id',
  },
];

describe.each(routes)(
  '$table infrastructure read route',
  ({ importRoute, table, wsColumn }) => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('requires inventory workspace authorization before using the admin client', async () => {
      mocks.authorizeInventoryWorkspace.mockResolvedValue({
        ok: false,
        response: Response.json({ message: 'Unauthorized' }, { status: 401 }),
      });

      const { GET } = await importRoute();
      const response = await GET(
        new Request('https://app.example.com/api?ws_id=victim-ws')
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        message: 'Unauthorized',
      });
      expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
        expect.any(Request),
        'victim-ws'
      );
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });

    it('queries private inventory data only for the authorized normalized workspace', async () => {
      const selectClient = createSelectClient([{ id: 'row-1' }]);
      mocks.createAdminClient.mockResolvedValue(selectClient.client);
      mocks.authorizeInventoryWorkspace.mockResolvedValue({
        ok: true,
        value: {
          permissions: permissionsWith(['view_inventory_catalog']),
          userId: 'user-1',
          wsId: 'normalized-ws',
        },
      });

      const { GET } = await importRoute();
      const response = await GET(
        new Request(
          'https://app.example.com/api?ws_id=personal&offset=2&limit=3'
        )
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        count: 1,
        data: [{ id: 'row-1' }],
      });
      expect(selectClient.schema).toHaveBeenCalledWith('private');
      expect(selectClient.from).toHaveBeenCalledWith(table);
      expect(selectClient.eq).toHaveBeenCalledWith(wsColumn, 'normalized-ws');
      expect(selectClient.range).toHaveBeenCalledWith(2, 4);
    });

    it('rejects authorized workspace members without inventory read permissions', async () => {
      mocks.authorizeInventoryWorkspace.mockResolvedValue({
        ok: true,
        value: {
          permissions: permissionsWith([]),
          userId: 'user-1',
          wsId: 'normalized-ws',
        },
      });

      const { GET } = await importRoute();
      const response = await GET(
        new Request('https://app.example.com/api?ws_id=personal')
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        message: 'Insufficient permissions to view inventory',
      });
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    });
  }
);
