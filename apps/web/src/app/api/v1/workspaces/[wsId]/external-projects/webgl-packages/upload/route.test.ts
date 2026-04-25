import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('WebGL package proxy upload route', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    mocks.getWebglPackageEntryContext.mockResolvedValue({
      collectionSlug: 'games',
      collectionType: 'games',
      entrySlug: 'mine',
    });
    mocks.createWorkspaceStorageUploadPayload.mockResolvedValue({
      fullPath:
        'ws-1/external-projects/yoola/games/mine/webgl-packages/upload.zip',
      path: 'external-projects/yoola/games/mine/webgl-packages/upload.zip',
      signedUrl: 'https://storage.example/upload.zip',
      token: 'storage-token',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      })
    );
  });

  it('streams ZIP bytes through a backend signed storage upload', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route'
    );

    const response = await PUT(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload?entryId=00000000-0000-4000-8000-000000000001&archivePath=external-projects%2Fyoola%2Fgames%2Fmine%2Fwebgl-packages%2Fupload.zip&filename=Mine+Blast+WebGL.zip',
        {
          body: new Blob(['zip'], { type: 'application/zip' }),
          headers: {
            'Content-Type': 'application/zip',
          },
          method: 'PUT',
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
      archivePath:
        'external-projects/yoola/games/mine/webgl-packages/upload.zip',
      fullPath:
        'ws-1/external-projects/yoola/games/mine/webgl-packages/upload.zip',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).toHaveBeenCalledWith(
      'ws-1',
      'upload.zip',
      {
        contentType: 'application/zip',
        path: 'external-projects/yoola/games/mine/webgl-packages',
        size: undefined,
        upsert: false,
      }
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.example/upload.zip',
      expect.objectContaining({
        body: expect.any(ReadableStream),
        cache: 'no-store',
        duplex: 'half',
        headers: expect.any(Headers),
        method: 'PUT',
      })
    );
  });

  it('allows credentialed CMS browser uploads from the configured CMS origin', async () => {
    const { OPTIONS, PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route'
    );
    const requestUrl =
      'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload?entryId=00000000-0000-4000-8000-000000000001&archivePath=external-projects%2Fyoola%2Fgames%2Fmine%2Fwebgl-packages%2Fupload.zip&filename=Mine+Blast+WebGL.zip';

    const preflight = OPTIONS(
      new Request(requestUrl, {
        headers: {
          Origin: 'https://cms.tuturuuu.com',
        },
        method: 'OPTIONS',
      })
    );

    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://cms.tuturuuu.com'
    );
    expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBe(
      'true'
    );

    const response = await PUT(
      new Request(requestUrl, {
        body: new Blob(['zip'], { type: 'application/zip' }),
        headers: {
          'Content-Type': 'application/zip',
          Origin: 'https://cms.tuturuuu.com',
        },
        method: 'PUT',
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://cms.tuturuuu.com'
    );
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
      'true'
    );
  });

  it('rejects archive paths outside the entry WebGL package folder', async () => {
    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/webgl-packages/upload/route'
    );

    const response = await PUT(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/webgl-packages/upload?entryId=00000000-0000-4000-8000-000000000001&archivePath=external-projects%2Fyoola%2Fgames%2Fother%2Fwebgl-packages%2Fupload.zip&filename=Mine+Blast+WebGL.zip',
        {
          body: new Blob(['zip'], { type: 'application/zip' }),
          headers: {
            'Content-Type': 'application/zip',
          },
          method: 'PUT',
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
      error: 'Invalid WebGL package upload path.',
    });
    expect(mocks.createWorkspaceStorageUploadPayload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
