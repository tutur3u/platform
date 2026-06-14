import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@/lib/inventory/permissions', () => ({
  canManageInventoryCatalog: (permissions: {
    containsPermission: (permission: string) => boolean;
  }) => permissions.containsPermission('manage_inventory_catalog'),
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageSignedReadUrl>
  ) => mocks.createWorkspaceStorageSignedReadUrl(...args),
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

function permissions(canManage = true) {
  return {
    containsPermission: (permission: string) =>
      canManage && permission === 'manage_inventory_catalog',
  };
}

async function postReadUrl(payload: Record<string, unknown>) {
  const { POST } = await import('./route');
  return POST(
    new Request(
      'http://localhost/api/v1/workspaces/personal/inventory/media/read-url',
      {
        body: JSON.stringify(payload),
        method: 'POST',
      }
    ),
    {
      params: Promise.resolve({ wsId: 'personal' }),
    }
  );
}

describe('inventory media read-url route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions(),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example.com/read'
    );
  });

  it('creates read URLs for uploaded inventory images', async () => {
    const response = await postReadUrl({
      path: 'inventory/media/product-featured-image/upload-id-poster.webp',
      provider: 'r2',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      readUrl: 'https://storage.example.com/read',
    });
    expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
      'workspace-1',
      'inventory/media/product-featured-image/upload-id-poster.webp',
      {
        expiresIn: 31_536_000,
        provider: 'r2',
        requireExists: true,
      }
    );
  });

  it('rejects read URLs outside inventory media', async () => {
    const response = await postReadUrl({
      path: 'drive/private/file.webp',
      provider: 'r2',
    });

    expect(response.status).toBe(400);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('rejects callers without catalog management access', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: permissions(false),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });

    const response = await postReadUrl({
      path: 'inventory/media/product-featured-image/upload-id-poster.webp',
    });

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });
});
