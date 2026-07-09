import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  authorizeInventoryWorkspace: vi.fn(),
  createAdminClient: vi.fn(),
  createInventoryAuditLog: vi.fn(),
  getInventoryActorContext: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/inventory-core/actor', () => ({
  getInventoryActorContext: (
    ...args: Parameters<typeof mocks.getInventoryActorContext>
  ) => mocks.getInventoryActorContext(...args),
}));

vi.mock('@tuturuuu/inventory-core/audit', () => ({
  createInventoryAuditLog: (
    ...args: Parameters<typeof mocks.createInventoryAuditLog>
  ) => mocks.createInventoryAuditLog(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
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

function createInsertClient(row: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  const schema = vi.fn(() => ({ from }));

  return {
    client: { schema },
    from,
    insert,
    schema,
    select,
    single,
  };
}

describe('product units API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createInventoryAuditLog.mockResolvedValue(undefined);
    mocks.getInventoryActorContext.mockResolvedValue({ userId: 'user-1' });
  });

  it('creates units for users with manage_inventory_setup without feature-flag gating', async () => {
    const insertClient = createInsertClient({
      id: 'unit-1',
      name: 'Box',
      ws_id: 'ws-1',
    });

    mocks.createAdminClient.mockResolvedValue(insertClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['manage_inventory_setup']),
        wsId: 'ws-1',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Box' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'unit-1', name: 'Box', ws_id: 'ws-1' },
      message: 'success',
    });
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(insertClient.schema).toHaveBeenCalledWith('private');
    expect(insertClient.from).toHaveBeenCalledWith('inventory_units');
    expect(insertClient.insert).toHaveBeenCalledWith({
      name: 'Box',
      ws_id: 'ws-1',
    });
  });

  it('rejects unit creation for update-only inventory users', async () => {
    const insertClient = createInsertClient({
      id: 'unit-1',
      name: 'Box',
      ws_id: 'ws-1',
    });

    mocks.createAdminClient.mockResolvedValue(insertClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['update_inventory']),
        wsId: 'ws-1',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Box' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions to create units',
    });
    expect(insertClient.insert).not.toHaveBeenCalled();
  });

  it('rejects unit creation for delete-only inventory users', async () => {
    const insertClient = createInsertClient({
      id: 'unit-1',
      name: 'Box',
      ws_id: 'ws-1',
    });

    mocks.createAdminClient.mockResolvedValue(insertClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['delete_inventory']),
        wsId: 'ws-1',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Box' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions to create units',
    });
    expect(insertClient.insert).not.toHaveBeenCalled();
  });

  it('returns 403 for users without setup permissions instead of feature-flag 404', async () => {
    const insertClient = createInsertClient({
      id: 'unit-1',
      name: 'Box',
      ws_id: 'ws-1',
    });

    mocks.createAdminClient.mockResolvedValue(insertClient.client);
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith([]),
        wsId: 'ws-1',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ name: 'Box' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions to create units',
    });
    expect(insertClient.insert).not.toHaveBeenCalled();
  });
});
