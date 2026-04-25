import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageUploadPayload: vi.fn(),
  getWebglPackageEntryContext: vi.fn(),
  isCmsGamesEnabled: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
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
  createWorkspaceStorageUploadPayload: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageUploadPayload>
  ) => mocks.createWorkspaceStorageUploadPayload(...args),
}));

vi.mock('../shared', () => ({
  buildWebglPackageUploadPath: () =>
    'external-projects/yoola/games/mine/webgl-packages',
  getWebglPackageEntryContext: (
    ...args: Parameters<typeof mocks.getWebglPackageEntryContext>
  ) => mocks.getWebglPackageEntryContext(...args),
  isCmsGamesEnabled: (...args: Parameters<typeof mocks.isCmsGamesEnabled>) =>
    mocks.isCmsGamesEnabled(...args),
  sanitizeWebglZipFilename: (value: string) => value,
}));

describe('WebGL package upload URL route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: {},
      binding: {
        adapter: 'yoola',
      },
      normalizedWorkspaceId: 'ws-1',
      ok: true,
      user: {
        id: 'user-1',
      },
    });
    mocks.isCmsGamesEnabled.mockResolvedValue(true);
  });

  it('rejects upload URL creation when CMS Games is disabled', async () => {
    mocks.isCmsGamesEnabled.mockResolvedValue(false);

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/webgl-packages/upload-url/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload-url',
        {
          body: JSON.stringify({
            contentType: 'application/zip',
            entryId: '00000000-0000-4000-8000-000000000001',
            filename: 'Mine Blast WebGL.zip',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'CMS Games is disabled for this workspace.',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('rejects non-ZIP uploads before creating a signed upload URL', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/webgl-packages/upload-url/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload-url',
        {
          body: JSON.stringify({
            contentType: 'text/html',
            entryId: '00000000-0000-4000-8000-000000000001',
            filename: 'index.html',
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'WebGL package uploads must be ZIP archives.',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
  });

  it('creates a signed upload URL for ZIP packages', async () => {
    mocks.getWebglPackageEntryContext.mockResolvedValue({
      collectionSlug: 'games',
      collectionType: 'games',
      entrySlug: 'mine',
    });
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      fullPath:
        'ws-1/external-projects/yoola/games/mine/webgl-packages/upload.zip',
      path: 'external-projects/yoola/games/mine/webgl-packages/upload.zip',
      signedUrl: 'https://upload.example.com',
      token: 'token-1',
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/webgl-packages/upload-url/route'
    );

    const response = await POST(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload-url',
        {
          body: JSON.stringify({
            contentType: 'application/zip',
            entryId: '00000000-0000-4000-8000-000000000001',
            filename: 'Mine Blast WebGL.zip',
            size: 1000,
          }),
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
      archivePath: expect.stringContaining(
        'external-projects/yoola/games/mine/webgl-packages/'
      ),
      proxyUploadUrl: expect.stringContaining(
        '/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload?'
      ),
      signedUrl: 'https://upload.example.com',
      token: 'token-1',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalled();
  });
});
