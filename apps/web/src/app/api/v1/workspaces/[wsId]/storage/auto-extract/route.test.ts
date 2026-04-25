import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageFolderObject: vi.fn(),
  createWorkspaceStorageUploadPayload: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveWorkspaceStorageAutoExtractConfig: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@/lib/workspace-storage-auto-extract', () => ({
  resolveWorkspaceStorageAutoExtractConfig: (
    ...args: Parameters<typeof mocks.resolveWorkspaceStorageAutoExtractConfig>
  ) => mocks.resolveWorkspaceStorageAutoExtractConfig(...args),
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
  createWorkspaceStorageFolderObject: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageFolderObject>
  ) => mocks.createWorkspaceStorageFolderObject(...args),
  createWorkspaceStorageUploadPayload: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageUploadPayload>
  ) => mocks.createWorkspaceStorageUploadPayload(...args),
  uploadWorkspaceStorageFileDirect: (
    ...args: Parameters<typeof mocks.uploadWorkspaceStorageFileDirect>
  ) => mocks.uploadWorkspaceStorageFileDirect(...args),
}));

describe('storage auto-extract callback route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveWorkspaceStorageAutoExtractConfig.mockResolvedValue({
      configured: true,
      enabled: true,
      proxyToken: 'token-1',
      proxyUrl: 'http://storage-unzip-proxy:8788/extract',
    });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath: 'ws-1/archive/index.html',
      path: 'archive/index.html',
    });
  });

  it('accepts extracted file bytes and writes them server-side', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/auto-extract/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/storage/auto-extract',
        {
          body: '<html></html>',
          headers: {
            Authorization: 'Bearer token-1',
            'Content-Type': 'text/html',
            'x-drive-auto-extract-operation': 'file',
            'x-drive-auto-extract-path': 'archive/index.html',
          },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: 'File extracted successfully',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'ws-1',
      'archive/index.html',
      expect.any(Uint8Array),
      {
        contentType: 'text/html',
        upsert: true,
      }
    );
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('returns signed upload URLs for extracted files to avoid large callback bodies', async () => {
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      fullPath: 'ws-1/archive/Build/game.data',
      headers: {
        'x-amz-acl': 'private',
      },
      path: 'archive/Build/game.data',
      signedUrl: 'https://storage.example.com/upload',
      token: undefined,
    });
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/auto-extract/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/storage/auto-extract',
        {
          body: JSON.stringify({
            contentType: 'application/octet-stream',
            size: 23_000_000,
          }),
          headers: {
            Authorization: 'Bearer token-1',
            'Content-Type': 'application/json',
            'x-drive-auto-extract-operation': 'file-upload-url',
            'x-drive-auto-extract-path': 'archive/Build/game.data',
          },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fullPath: 'ws-1/archive/Build/game.data',
      headers: {
        'x-amz-acl': 'private',
      },
      path: 'archive/Build/game.data',
      signedUrl: 'https://storage.example.com/upload',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'ws-1',
      'game.data',
      {
        contentType: 'application/octet-stream',
        path: 'archive/Build',
        size: 23_000_000,
        upsert: true,
      }
    );
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });
});
