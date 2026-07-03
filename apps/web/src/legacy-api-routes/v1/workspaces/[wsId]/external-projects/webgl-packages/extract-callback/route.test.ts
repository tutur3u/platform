import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
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
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route'
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

  it('returns provider-scoped signed upload URLs for extracted WebGL files', async () => {
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      fullPath:
        'ws-1/external-projects/yoola/games/mine/webgl-packages/build/Build/game.data',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      path: 'external-projects/yoola/games/mine/webgl-packages/build/Build/game.data',
      provider: 'r2',
      signedUrl:
        'https://account-id.r2.cloudflarestorage.com/bucket/ws-1/game.data',
      token: undefined,
    });
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/extract-callback',
        {
          body: JSON.stringify({
            contentType: 'application/octet-stream',
            size: 23_000_000,
          }),
          headers: {
            Authorization: 'Bearer token-1',
            'Content-Type': 'application/json',
            'x-drive-auto-extract-operation': 'file-upload-url',
            'x-drive-auto-extract-path':
              'external-projects/yoola/games/mine/webgl-packages/build/Build/game.data',
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
      fullPath:
        'ws-1/external-projects/yoola/games/mine/webgl-packages/build/Build/game.data',
      path: 'external-projects/yoola/games/mine/webgl-packages/build/Build/game.data',
      provider: 'r2',
      signedUrl:
        'https://account-id.r2.cloudflarestorage.com/bucket/ws-1/game.data',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'ws-1',
      'game.data',
      {
        contentType: 'application/octet-stream',
        path: 'external-projects/yoola/games/mine/webgl-packages/build/Build',
        size: 23_000_000,
        upsert: true,
      }
    );
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects oversized direct WebGL file callback bodies with valid tokens', async () => {
    const { POST } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/extract-callback',
        {
          body: 'x'.repeat(MAX_PAYLOAD_SIZE + 1),
          headers: {
            Authorization: 'Bearer token-1',
            'Content-Type': 'text/plain',
            'x-drive-auto-extract-operation': 'file',
            'x-drive-auto-extract-path':
              'external-projects/yoola/games/mine/webgl-packages/build/large.txt',
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

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'Payload Too Large',
      message: 'Extracted file exceeds direct callback body limit',
    });
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });
});
