import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  cancelInventorySquareTerminalCheckout: vi.fn(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  cancelInventorySquareTerminalCheckout: (
    ...args: Parameters<typeof mocks.cancelInventorySquareTerminalCheckout>
  ) => mocks.cancelInventorySquareTerminalCheckout(...args),
}));

function params() {
  return {
    params: Promise.resolve({
      checkoutId: 'checkout-1',
      wsId: 'workspace-1',
    }),
  };
}

function withPermissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('inventory Square terminal cancel route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.cancelInventorySquareTerminalCheckout.mockResolvedValue({
      id: 'checkout-1',
      status: 'cancelled',
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
    const response = await POST(new Request('http://localhost/api'), params());

    expect(response.status).toBe(403);
    expect(mocks.cancelInventorySquareTerminalCheckout).not.toHaveBeenCalled();
  });

  it('cancels through the authorized workspace id, not the raw URL id', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['update_invoices']),
        wsId: 'normalized-workspace',
      },
    });

    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api'), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { id: 'checkout-1', status: 'cancelled' },
    });
    expect(mocks.cancelInventorySquareTerminalCheckout).toHaveBeenCalledWith({
      checkoutId: 'checkout-1',
      wsId: 'normalized-workspace',
    });
  });
});
