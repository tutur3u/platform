import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  getState: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (...args: unknown[]) => mocks.authorize(...args),
}));
vi.mock('@tuturuuu/inventory-core/commerce/square', () => ({
  getInventorySquareSyncState: (...args: unknown[]) => mocks.getState(...args),
  syncInventorySquareCatalog: (...args: unknown[]) => mocks.sync(...args),
}));

const params = { params: Promise.resolve({ wsId: 'workspace-1' }) };
const request = (method = 'GET', body?: unknown) =>
  new Request(
    'http://localhost/api/v1/workspaces/workspace-1/inventory/square/catalog-sync',
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      method,
    }
  );
const permissions = (...granted: string[]) => ({
  containsPermission: vi.fn((permission: string) =>
    granted.includes(permission)
  ),
});

describe('Square catalog sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions('manage_inventory_setup'),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });
    mocks.getState.mockResolvedValue(null);
    mocks.sync.mockResolvedValue({ direction: 'bidirectional', conflicts: 0 });
  });

  it('loads the current environment sync state', async () => {
    mocks.getState.mockResolvedValue({
      lastStatus: 'success',
      links: [
        {
          productName: 'Demo poster',
          squareVariationId: 'variation-1',
          status: 'active',
        },
      ],
    });
    const { GET } = await import('./route');
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.getState).toHaveBeenCalledWith('workspace-1');
    await expect(response.json()).resolves.toEqual({
      lastStatus: 'success',
      links: [
        {
          productName: 'Demo poster',
          squareVariationId: 'variation-1',
          status: 'active',
        },
      ],
    });
  });

  it('rejects viewers without catalog and stock management access', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions('view_inventory_dashboard'),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });
    const { POST } = await import('./route');
    const response = await POST(
      request('POST', { direction: 'from_square' }),
      params
    );
    expect(response.status).toBe(403);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it.each([
    'from_square',
    'to_square',
    'bidirectional',
  ] as const)('runs %s sync with the authorized actor', async (direction) => {
    const { POST } = await import('./route');
    const response = await POST(request('POST', { direction }), params);
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith({
      direction,
      userId: 'user-1',
      wsId: 'workspace-1',
    });
  });

  it('rejects unsupported directions before provider access', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      request('POST', { direction: 'delete_square' }),
      params
    );
    expect(response.status).toBe(400);
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('returns reconnect guidance but sanitizes unknown provider failures', async () => {
    const { POST } = await import('./route');
    mocks.sync.mockRejectedValueOnce(
      new Error('Reconnect Square to grant catalog sync access: ITEMS_WRITE')
    );
    const reconnect = await POST(
      request('POST', { direction: 'to_square' }),
      params
    );
    await expect(reconnect.json()).resolves.toEqual({
      message: 'Reconnect Square to grant catalog sync access: ITEMS_WRITE',
    });

    mocks.sync.mockRejectedValueOnce(new Error('secret provider detail'));
    const unknown = await POST(
      request('POST', { direction: 'to_square' }),
      params
    );
    await expect(unknown.json()).resolves.toEqual({
      message: 'Failed to sync inventory with Square',
    });
  });
});
