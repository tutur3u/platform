import { MAX_PAYLOAD_SIZE } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { webglExtractionCallbackToken } from '@/lib/external-projects/webgl-extraction';

const root =
  'external-projects/yoola/games/mine/webgl-packages/_revisions/11111111-1111-4111-8111-111111111111';
const callback = `http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/extract-callback?root=${encodeURIComponent(root)}`;
const headers = () => ({
  Authorization: `Bearer ${webglExtractionCallbackToken('token-1', 'ws-1', root)}`,
});

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

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
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
      fullPath: `ws-1/${root}/index.html`,
      path: `${root}/index.html`,
    });
  });

  it('binds a callback to its revision and rejects an unrelated destination', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request(callback, {
        method: 'POST',
        body: 'fixture',
        headers: {
          ...headers(),
          'x-drive-auto-extract-path': `${root}-other/index.html`,
        },
      }),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );
    expect(response.status).toBe(401);
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('accepts extracted WebGL file bytes and writes them server-side', async () => {
    const { POST } =
      await import('@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route');

    const response = await POST(
      new Request(callback, {
        body: '<html></html>',
        headers: {
          ...headers(),
          'Content-Type': 'text/html',
          'x-drive-auto-extract-operation': 'file',
          'x-drive-auto-extract-path': `${root}/index.html`,
        },
        method: 'POST',
      }),
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
      `${root}/index.html`,
      expect.any(Uint8Array),
      {
        contentType: 'text/html',
        upsert: false,
      }
    );
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('returns provider-scoped signed upload URLs for extracted WebGL files', async () => {
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      fullPath: `ws-1/${root}/Build/game.data`,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      path: `${root}/Build/game.data`,
      provider: 'r2',
      signedUrl:
        'https://account-id.r2.cloudflarestorage.com/bucket/ws-1/game.data',
      token: undefined,
    });
    const { POST } =
      await import('@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route');

    const response = await POST(
      new Request(callback, {
        body: JSON.stringify({
          contentType: 'application/octet-stream',
          size: 23_000_000,
        }),
        headers: {
          ...headers(),
          'Content-Type': 'application/json',
          'x-drive-auto-extract-operation': 'file-upload-url',
          'x-drive-auto-extract-path': `${root}/Build/game.data`,
        },
        method: 'POST',
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      fullPath: `ws-1/${root}/Build/game.data`,
      path: `${root}/Build/game.data`,
      provider: 'r2',
      signedUrl:
        'https://account-id.r2.cloudflarestorage.com/bucket/ws-1/game.data',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'ws-1',
      'game.data',
      {
        contentType: 'application/octet-stream',
        path: `${root}/Build`,
        size: 23_000_000,
        upsert: false,
      }
    );
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
  });

  it('rejects oversized direct WebGL file callback bodies with valid tokens', async () => {
    const { POST } =
      await import('@/legacy-api-routes/v1/workspaces/[wsId]/external-projects/webgl-packages/extract-callback/route');

    const response = await POST(
      new Request(callback, {
        body: 'x'.repeat(MAX_PAYLOAD_SIZE + 1),
        headers: {
          ...headers(),
          'Content-Type': 'text/plain',
          'x-drive-auto-extract-operation': 'file',
          'x-drive-auto-extract-path': `${root}/large.txt`,
        },
        method: 'POST',
      }),
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
