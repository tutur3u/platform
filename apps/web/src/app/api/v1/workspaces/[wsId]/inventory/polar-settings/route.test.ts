import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  getInventoryPolarSettings: vi.fn(),
  saveInventoryPolarSettings: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@/lib/inventory/commerce/polar', () => ({
  getInventoryPolarSettings: (
    ...args: Parameters<typeof mocks.getInventoryPolarSettings>
  ) => mocks.getInventoryPolarSettings(...args),
  saveInventoryPolarSettings: (
    ...args: Parameters<typeof mocks.saveInventoryPolarSettings>
  ) => mocks.saveInventoryPolarSettings(...args),
}));

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

function request(method = 'GET', body?: unknown) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/inventory/polar-settings',
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      method,
    }
  );
}

function withPermissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('inventory Polar settings route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getInventoryPolarSettings.mockResolvedValue({
      integrations: [
        {
          accessTokenFingerprint: 'token-sha256',
          accessTokenLast4: '1234',
          environment: 'production',
          lastError: 'validation failed',
          lastValidatedAt: '2026-06-11T10:00:00.000Z',
          polarProductId: 'product-1',
          polarProductName: 'Private checkout',
          status: 'ready',
          updatedAt: '2026-06-11T10:00:00.000Z',
        },
      ],
      productionEnvironment: 'production',
      testingEnvironment: 'sandbox',
    });
  });

  it('does not expose full Polar settings to dashboard-only viewers', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['view_inventory_dashboard']),
        wsId: 'workspace-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(request(), params());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(mocks.getInventoryPolarSettings).not.toHaveBeenCalled();
  });

  it('returns full Polar settings to inventory setup managers', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['manage_inventory_setup']),
        wsId: 'workspace-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    expect(mocks.getInventoryPolarSettings).toHaveBeenCalledWith('workspace-1');
    await expect(response.json()).resolves.toMatchObject({
      integrations: [
        {
          accessTokenFingerprint: 'token-sha256',
          accessTokenLast4: '1234',
          polarProductId: 'product-1',
        },
      ],
    });
  });
});
