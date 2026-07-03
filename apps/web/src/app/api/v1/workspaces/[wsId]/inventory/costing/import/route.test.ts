import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  importCostingCsv: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/costing', () => ({
  importCostingCsv: (...args: Parameters<typeof mocks.importCostingCsv>) =>
    mocks.importCostingCsv(...args),
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

describe('inventory costing import API route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissionsWith(['manage_inventory_setup']),
        wsId: 'ws-1',
      },
    });
    mocks.importCostingCsv.mockResolvedValue({
      rows: [{ itemCategory: 'Acrylic Keychain' }],
      warnings: [],
    });
  });

  it('previews CSV imports without committing profiles', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({ csv: 'Item Category\nAcrylic Keychain' }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.importCostingCsv).toHaveBeenCalledWith('ws-1', {
      csv: 'Item Category\nAcrylic Keychain',
    });
  });

  it('commits CSV imports with created status', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      new Request('https://app.example.com/api', {
        body: JSON.stringify({
          commit: true,
          csv: 'Item Category\nAcrylic Keychain',
        }),
        method: 'POST',
      }),
      { params: Promise.resolve({ wsId: 'personal' }) }
    );

    expect(response.status).toBe(201);
    expect(mocks.importCostingCsv).toHaveBeenCalledWith('ws-1', {
      commit: true,
      csv: 'Item Category\nAcrylic Keychain',
    });
  });
});
