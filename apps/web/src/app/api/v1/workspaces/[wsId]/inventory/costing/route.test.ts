import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createCostProfile: vi.fn(),
  listCostProfiles: vi.fn(),
}));

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@/lib/inventory/costing', () => ({
  createCostProfile: (...args: Parameters<typeof mocks.createCostProfile>) =>
    mocks.createCostProfile(...args),
  listCostProfiles: (...args: Parameters<typeof mocks.listCostProfiles>) =>
    mocks.listCostProfiles(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: { error: vi.fn() },
}));

function permissionsWith(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('inventory costing API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith([
          'manage_inventory_setup',
          'view_inventory',
        ]),
        wsId: 'ws-1',
      },
    });
    mocks.listCostProfiles.mockResolvedValue({
      count: 1,
      data: [{ id: 'profile-1', name: 'Acrylic Keychain' }],
    });
    mocks.createCostProfile.mockResolvedValue({
      id: 'profile-1',
      name: 'Acrylic Keychain',
    });
  });

  it('lists cost profiles using the normalized workspace id and filters', async () => {
    const { GET } = await import('./route');

    const response = await GET(
      new Request(
        'https://app.example.com/api?response=paginated&pageSize=50&q=keychain&status=active'
      ),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      data: [{ id: 'profile-1', name: 'Acrylic Keychain' }],
    });
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(mocks.listCostProfiles).toHaveBeenCalledWith('ws-1', {
      pageSize: 50,
      q: 'keychain',
      response: 'paginated',
      status: 'active',
    });
  });

  it('creates cost profiles for setup-capable users', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({
          name: 'Acrylic Keychain',
          scenarios: [{ batchSize: 30, name: '30 units' }],
          targetRetailPrice: 10,
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.createCostProfile).toHaveBeenCalledWith('ws-1', {
      name: 'Acrylic Keychain',
      scenarios: [{ batchSize: 30, name: '30 units' }],
      targetRetailPrice: 10,
    });
  });

  it('rejects creation without setup permission', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['view_inventory']),
        wsId: 'ws-1',
      },
    });
    const { POST } = await import('./route');

    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({
          name: 'Acrylic Keychain',
          targetRetailPrice: 10,
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.createCostProfile).not.toHaveBeenCalled();
  });
});
