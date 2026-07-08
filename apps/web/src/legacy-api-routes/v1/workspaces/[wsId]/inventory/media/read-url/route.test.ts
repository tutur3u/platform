import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  resolveWorkspaceStorageProvider: vi.fn(),
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@tuturuuu/inventory-core/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@tuturuuu/inventory-core/permissions', () => ({
  canManageInventoryCatalog: (permissions: {
    containsPermission: (permission: string) => boolean;
  }) => permissions.containsPermission('manage_inventory_catalog'),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageSignedReadUrl>
  ) => mocks.createWorkspaceStorageSignedReadUrl(...args),
  deleteWorkspaceStorageObjectByPath: (
    ...args: Parameters<typeof mocks.deleteWorkspaceStorageObjectByPath>
  ) => mocks.deleteWorkspaceStorageObjectByPath(...args),
  downloadWorkspaceStorageObjectForProvider: (
    ...args: Parameters<typeof mocks.downloadWorkspaceStorageObjectForProvider>
  ) => mocks.downloadWorkspaceStorageObjectForProvider(...args),
  getWorkspaceStorageObjectMetadataForProvider: (
    ...args: Parameters<
      typeof mocks.getWorkspaceStorageObjectMetadataForProvider
    >
  ) => mocks.getWorkspaceStorageObjectMetadataForProvider(...args),
  resolveWorkspaceStorageProvider: (
    ...args: Parameters<typeof mocks.resolveWorkspaceStorageProvider>
  ) => mocks.resolveWorkspaceStorageProvider(...args),
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

const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

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
    mocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue({
      contentType: 'image/webp',
      size: webpBytes.byteLength,
    });
    mocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: webpBytes,
      contentType: 'image/webp',
    });
    mocks.deleteWorkspaceStorageObjectByPath.mockResolvedValue({
      deleted: 1,
      provider: 'r2',
    });
    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      provider: 'supabase',
    });
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
    expect(
      mocks.getWorkspaceStorageObjectMetadataForProvider
    ).toHaveBeenCalledWith(
      'workspace-1',
      'r2',
      'inventory/media/product-featured-image/upload-id-poster.webp'
    );
    expect(
      mocks.downloadWorkspaceStorageObjectForProvider
    ).toHaveBeenCalledWith(
      'workspace-1',
      'r2',
      'inventory/media/product-featured-image/upload-id-poster.webp'
    );
    expect(mocks.deleteWorkspaceStorageObjectByPath).not.toHaveBeenCalled();
  });

  it('rejects read URLs outside inventory media', async () => {
    const response = await postReadUrl({
      path: 'drive/private/file.webp',
      provider: 'r2',
    });

    expect(response.status).toBe(400);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });

  it('rejects finalized media that is not an actual image', async () => {
    mocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new Uint8Array([0x7b, 0x22, 0x70, 0x77, 0x6e, 0x22, 0x7d]),
      contentType: 'image/webp',
    });

    const response = await postReadUrl({
      path: 'inventory/media/product-featured-image/upload-id-poster.webp',
      provider: 'r2',
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'Inventory media upload must be a valid image',
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'workspace-1',
      'inventory/media/product-featured-image/upload-id-poster.webp'
    );
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
