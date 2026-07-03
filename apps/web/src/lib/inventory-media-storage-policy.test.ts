import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  resolveWorkspaceStorageProvider: vi.fn(),
}));

vi.mock('../workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: mocks.deleteWorkspaceStorageObjectByPath,
  downloadWorkspaceStorageObjectForProvider:
    mocks.downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageObjectMetadataForProvider:
    mocks.getWorkspaceStorageObjectMetadataForProvider,
  resolveWorkspaceStorageProvider: mocks.resolveWorkspaceStorageProvider,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('inventory media storage policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      provider: 'supabase',
    });
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
      provider: 'supabase',
    });
  });

  it('accepts finalized inventory media with matching image bytes', async () => {
    const { validateFinalizedInventoryMediaUpload } = await import(
      './inventory-media-storage-policy'
    );

    await expect(
      validateFinalizedInventoryMediaUpload({
        path: 'inventory/media/product-featured-image/upload-id-poster.webp',
        provider: 'supabase',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({
      contentType: 'image/webp',
      ok: true,
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).not.toHaveBeenCalled();
  });

  it('rejects oversized finalized inventory media and deletes the object', async () => {
    mocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue({
      contentType: 'image/webp',
      size: 9 * 1024 * 1024,
    });

    const { validateFinalizedInventoryMediaUpload } = await import(
      './inventory-media-storage-policy'
    );

    await expect(
      validateFinalizedInventoryMediaUpload({
        path: 'inventory/media/product-featured-image/upload-id-poster.webp',
        provider: 'supabase',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({
      message: 'Inventory image must be 8 MB or smaller',
      ok: false,
      status: 413,
    });
    expect(
      mocks.downloadWorkspaceStorageObjectForProvider
    ).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'workspace-1',
      'inventory/media/product-featured-image/upload-id-poster.webp'
    );
  });

  it('rejects non-image finalized inventory media and deletes the object', async () => {
    mocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new Uint8Array([0x7b, 0x22, 0x70, 0x77, 0x6e, 0x22, 0x7d]),
      contentType: 'image/webp',
    });

    const { validateFinalizedInventoryMediaUpload } = await import(
      './inventory-media-storage-policy'
    );

    await expect(
      validateFinalizedInventoryMediaUpload({
        path: 'inventory/media/product-featured-image/upload-id-poster.webp',
        provider: 'supabase',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({
      message: 'Inventory media upload must be a valid image',
      ok: false,
      status: 415,
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'workspace-1',
      'inventory/media/product-featured-image/upload-id-poster.webp'
    );
  });

  it('rejects unknown inventory media targets', async () => {
    const { validateFinalizedInventoryMediaUpload } = await import(
      './inventory-media-storage-policy'
    );

    await expect(
      validateFinalizedInventoryMediaUpload({
        path: 'inventory/media/unknown/upload-id-poster.webp',
        provider: 'supabase',
        wsId: 'workspace-1',
      })
    ).resolves.toEqual({
      message: 'Path must point to inventory media',
      ok: false,
      status: 400,
    });
    expect(
      mocks.getWorkspaceStorageObjectMetadataForProvider
    ).not.toHaveBeenCalled();
  });
});
