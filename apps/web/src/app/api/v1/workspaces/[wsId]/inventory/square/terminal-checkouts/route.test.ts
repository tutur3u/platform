import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createInventorySquareTerminalCheckout: vi.fn(),
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

vi.mock('@/lib/inventory/commerce/square', () => ({
  createInventorySquareTerminalCheckout: (
    ...args: Parameters<typeof mocks.createInventorySquareTerminalCheckout>
  ) => mocks.createInventorySquareTerminalCheckout(...args),
}));

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

function request(body: unknown) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/inventory/square/terminal-checkouts',
    {
      body: JSON.stringify(body),
      method: 'POST',
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

describe('inventory Square terminal checkout route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createInventorySquareTerminalCheckout.mockResolvedValue({
      checkout: { id: 'checkout-1' },
      squareCheckout: { id: 'terminal-checkout-1' },
    });
  });

  it('rejects callers without sales update permissions', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['view_inventory_sales']),
        wsId: 'workspace-1',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      request({
        checkoutId: '00000000-0000-4000-8000-000000000001',
      }),
      params()
    );

    expect(response.status).toBe(403);
    expect(mocks.createInventorySquareTerminalCheckout).not.toHaveBeenCalled();
  });

  it('creates terminal checkouts through the workspace-scoped helper', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['update_invoices']),
        wsId: 'workspace-1',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      request({
        checkoutId: '00000000-0000-4000-8000-000000000001',
        deviceId: 'device-1',
      }),
      params()
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'checkout-1' },
    });
    expect(mocks.createInventorySquareTerminalCheckout).toHaveBeenCalledWith({
      checkoutId: '00000000-0000-4000-8000-000000000001',
      deviceId: 'device-1',
      wsId: 'workspace-1',
    });
  });

  it('rejects invalid checkout identifiers before calling Square', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['update_invoices']),
        wsId: 'workspace-1',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(
      request({ checkoutId: 'not-a-guid' }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.createInventorySquareTerminalCheckout).not.toHaveBeenCalled();
  });
});
