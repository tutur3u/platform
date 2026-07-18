import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  createInventoryAuditLog: vi.fn(),
  getInventoryActorContext: vi.fn(),
  resolveProductManufacturerId: vi.fn(),
  validateInventoryItemWorkspaceRelations: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/actor', () => ({
  getInventoryActorContext: (...args: unknown[]) =>
    mocks.getInventoryActorContext(...args),
}));

vi.mock('@tuturuuu/inventory-core/audit', () => ({
  createInventoryAuditLog: (...args: unknown[]) =>
    mocks.createInventoryAuditLog(...args),
  diffInventoryAuditFields: vi.fn(() => []),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) =>
    mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/manufacturers', () => ({
  resolveProductManufacturerId: (...args: unknown[]) =>
    mocks.resolveProductManufacturerId(...args),
}));

vi.mock('@tuturuuu/inventory-core/product-rpc', () => ({
  getInventoryCatalogProducts: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/relation-validation', () => ({
  validateInventoryItemWorkspaceRelations: (...args: unknown[]) =>
    mocks.validateInventoryItemWorkspaceRelations(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

function thenableQuery<T>(result: T) {
  const query = Promise.resolve(result) as Promise<T> & {
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  query.select = vi.fn(() => query);
  return query;
}

function createProductClient({
  archiveResult = { data: { id: 'product-1' }, error: null },
  deleteResult = { data: { id: 'product-1' }, error: null },
}: {
  archiveResult?: {
    data: { id: string } | null;
    error: { code?: string; message?: string } | null;
  };
  deleteResult?: {
    data: { id: string } | null;
    error: { code?: string; message?: string } | null;
  };
}) {
  const selectQuery = thenableQuery({
    data: { id: 'product-1', name: 'Demo product', ws_id: 'ws-real' },
    error: null,
  });
  const deleteQuery = thenableQuery(deleteResult);
  const archiveQuery = thenableQuery(archiveResult);
  const from = vi.fn((table: string) => {
    if (table !== 'workspace_products') {
      throw new Error(`Unexpected table: ${table}`);
    }
    return {
      delete: vi.fn(() => deleteQuery),
      select: vi.fn(() => selectQuery),
      update: vi.fn(() => archiveQuery),
    };
  });
  return { from, schema: vi.fn() };
}

async function deleteProduct() {
  const { DELETE } = await import('./route');
  return DELETE(
    new Request(
      'http://localhost/api/v1/workspaces/ws-alias/products/product-1',
      { method: 'DELETE' }
    ),
    {
      params: Promise.resolve({
        productId: 'product-1',
        wsId: 'ws-alias',
      }),
    }
  );
}

describe('inventory product delete route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['manage_inventory_catalog']),
        wsId: 'ws-real',
      },
    });
    mocks.getInventoryActorContext.mockResolvedValue({
      authUserId: 'user-1',
    });
    mocks.resolveProductManufacturerId.mockResolvedValue({
      ok: true,
      manufacturerId: undefined,
    });
  });

  it('hard deletes products without historical dependencies', async () => {
    mocks.createAdminClient.mockResolvedValue(createProductClient({}));

    const response = await deleteProduct();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      disposition: 'deleted',
      message: 'success',
    });
    expect(mocks.createInventoryAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventKind: 'deleted', entityId: 'product-1' })
    );
  });

  it('archives products that completed checkouts or sales still reference', async () => {
    mocks.createAdminClient.mockResolvedValue(
      createProductClient({
        deleteResult: {
          data: null,
          error: { code: '23503', message: 'foreign key violation' },
        },
      })
    );

    const response = await deleteProduct();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      disposition: 'archived',
      message:
        'Product archived because completed sales or checkouts still reference it',
    });
    expect(mocks.createInventoryAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        after: { archived: true },
        changedFields: ['archived'],
        eventKind: 'updated',
      })
    );
  });

  it('does not hide unexpected deletion failures', async () => {
    mocks.createAdminClient.mockResolvedValue(
      createProductClient({
        deleteResult: {
          data: null,
          error: { code: 'XX000', message: 'database unavailable' },
        },
      })
    );

    const response = await deleteProduct();

    expect(response.status).toBe(500);
  });
});

describe('inventory product update route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['manage_inventory_catalog']),
        wsId: 'ws-real',
      },
    });
    mocks.getInventoryActorContext.mockResolvedValue({ authUserId: 'user-1' });
    mocks.resolveProductManufacturerId.mockResolvedValue({
      ok: true,
      manufacturerId: undefined,
    });
  });

  it('persists product usage details as an explicit field', async () => {
    const update = vi.fn();
    const existingQuery = thenableQuery({
      data: {
        avatar_url: null,
        category_id: 'category-1',
        description: null,
        finance_category_id: null,
        id: 'product-1',
        manufacturer_id: null,
        name: 'Demo product',
        owner_id: 'owner-1',
        usage: 'Old usage',
      },
      error: null,
    });
    const updateQuery = thenableQuery({
      data: { id: 'product-1' },
      error: null,
    });
    update.mockReturnValue(updateQuery);
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => ({
        select: vi.fn(() => existingQuery),
        update,
      })),
      schema: vi.fn(() => ({})),
    });

    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/ws-alias/products/product-1',
        {
          body: JSON.stringify({ usage: 'Counter display' }),
          headers: { 'content-type': 'application/json' },
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({
          productId: 'product-1',
          wsId: 'ws-alias',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ usage: 'Counter display' });
    expect(mocks.createInventoryAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        after: expect.objectContaining({ usage: 'Counter display' }),
      })
    );
  });
});
