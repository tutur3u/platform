import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageFolderObject: vi.fn(),
  createWorkspaceStorageUploadPayload: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveWebglPackageExtractConfig: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
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

vi.mock('../shared', () => ({
  resolveWebglPackageExtractConfig: (
    ...args: Parameters<typeof mocks.resolveWebglPackageExtractConfig>
  ) => mocks.resolveWebglPackageExtractConfig(...args),
}));

describe('WebGL package extract callback route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveWebglPackageExtractConfig.mockResolvedValue({
      configured: true,
      proxyToken: 'token-1',
      proxyUrl: 'http://storage-unzip-proxy:8788/extract',
    });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath:
        'ws-1/external-projects/yoola/games/mine/webgl-packages/build/index.html',
      path: 'external-projects/yoola/games/mine/webgl-packages/build/index.html',
    });
  });

  it('accepts extracted WebGL file bytes and writes them server-side', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/extract-callback',
        {
          body: '<html></html>',
          headers: {
            Authorization: 'Bearer token-1',
            'Content-Type': 'text/html',
            'x-drive-auto-extract-operation': 'file',
            'x-drive-auto-extract-path':
              'external-projects/yoola/games/mine/webgl-packages/build/index.html',
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
      'external-projects/yoola/games/mine/webgl-packages/build/index.html',
      expect.any(Uint8Array),
      {
        contentType: 'text/html',
        upsert: true,
      }
    );
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });
});
