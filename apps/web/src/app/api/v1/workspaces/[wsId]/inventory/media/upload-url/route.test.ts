import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  createWorkspaceStorageUploadPayload: vi.fn(),
  generateRandomUUID: vi.fn(() => 'upload-id'),
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/utils/uuid-helper', () => ({
  generateRandomUUID: mocks.generateRandomUUID,
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
  createWorkspaceStorageUploadPayload: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageUploadPayload>
  ) => mocks.createWorkspaceStorageUploadPayload(...args),
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

async function postUploadUrl(payload: Record<string, unknown>) {
  const { POST } = await import('./route');
  return POST(
    new Request(
      'http://localhost/api/v1/workspaces/personal/inventory/media/upload-url',
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

describe('inventory media upload-url route', () => {
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
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      contentType: 'image/webp',
      filename: 'upload-id-poster.webp',
      fullPath:
        'workspace-1/inventory/media/product-featured-image/upload-id-poster.webp',
      headers: { 'Content-Type': 'image/webp' },
      path: 'inventory/media/product-featured-image/upload-id-poster.webp',
      provider: 'r2',
      signedUrl: 'https://storage.example.com/upload',
      token: undefined,
    });
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example.com/read'
    );
  });

  it('creates upload URLs for inventory images', async () => {
    const response = await postUploadUrl({
      contentType: 'image/webp',
      filename: 'poster.webp',
      size: 1024,
      target: 'product-featured-image',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      path: 'inventory/media/product-featured-image/upload-id-poster.webp',
      signedUrl: 'https://storage.example.com/upload',
      target: 'product-featured-image',
    });
    expect(mocks.authorizeInventoryWorkspace).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'workspace-1',
      'upload-id-poster.webp',
      {
        contentType: 'image/webp',
        path: 'inventory/media/product-featured-image',
        size: 1024,
        upsert: false,
      }
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

    const response = await postUploadUrl({
      contentType: 'image/png',
      filename: 'poster.png',
      size: 1024,
      target: 'product-featured-image',
    });

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects unsupported media payloads', async () => {
    const response = await postUploadUrl({
      contentType: 'image/svg+xml',
      filename: 'poster.svg',
      size: 1024,
      target: 'product-featured-image',
    });

    expect(response.status).toBe(400);
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });
});
