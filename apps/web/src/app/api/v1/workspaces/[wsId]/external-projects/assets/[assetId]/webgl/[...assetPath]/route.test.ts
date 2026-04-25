import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
  resolveWorkspaceExternalProjectBinding: (
    ...args: Parameters<typeof mocks.resolveWorkspaceExternalProjectBinding>
  ) => mocks.resolveWorkspaceExternalProjectBinding(...args),
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
  downloadWorkspaceStorageObjectForProvider: (
    ...args: Parameters<typeof mocks.downloadWorkspaceStorageObjectForProvider>
  ) => mocks.downloadWorkspaceStorageObjectForProvider(...args),
}));

const artifactMetadata = {
  archivePath: 'external-projects/yoola/games/mine/webgl-packages/package.zip',
  assetUrls: {
    'Build/Mine Blast WebGL.loader.js':
      '/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/Build/Mine%20Blast%20WebGL.loader.js',
    'index.html':
      '/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/index.html',
  },
  entryRelativePath: 'index.html',
  entryUrl:
    '/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/index.html',
  files: [
    {
      contentType: 'text/html; charset=utf-8',
      relativePath: 'index.html',
      size: 100,
    },
  ],
  kind: 'webgl-package',
  provider: 'supabase',
  rootPath:
    'external-projects/yoola/games/mine/webgl-packages/package/Mine Blast WebGL',
  version: 1,
};

function createAdminWithAsset(status: 'draft' | 'published') {
  return {
    from: vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          asset_type: 'webgl-package',
          id: 'asset-1',
          metadata: artifactMetadata,
          workspace_external_project_entries: {
            status,
          },
          ws_id: 'ws-1',
        },
        error: null,
      }),
    })),
  };
}

async function callRoute(assetPath: string[]) {
  const { GET } = await import(
    '@/app/api/v1/workspaces/[wsId]/external-projects/assets/[assetId]/webgl/[...assetPath]/route'
  );

  return GET(
    new Request(
      'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/index.html'
    ),
    {
      params: Promise.resolve({
        assetId: 'asset-1',
        assetPath,
        wsId: 'ws-1',
      }),
    }
  );
}

describe('WebGL package asset route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      canonical_project: {
        id: 'project-1',
      },
      enabled: true,
    });
  });

  it('blocks unpublished WebGL package files for anonymous users', async () => {
    mocks.createAdminClient.mockResolvedValue(createAdminWithAsset('draft'));
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: false,
    });

    const response = await callRoute(['index.html']);

    expect(response.status).toBe(404);
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'read',
        wsId: 'ws-1',
      })
    );
    expect(
      mocks.downloadWorkspaceStorageObjectForProvider
    ).not.toHaveBeenCalled();
  });

  it('allows CMS read access to preview unpublished WebGL package files', async () => {
    mocks.createAdminClient.mockResolvedValue(createAdminWithAsset('draft'));
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: true,
    });
    mocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new TextEncoder().encode('<html></html>'),
      contentType: 'application/octet-stream',
    });

    const response = await callRoute(['index.html']);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(
      mocks.downloadWorkspaceStorageObjectForProvider
    ).toHaveBeenCalledWith(
      'ws-1',
      'supabase',
      'external-projects/yoola/games/mine/webgl-packages/package/Mine Blast WebGL/index.html'
    );
  });

  it('serves index.html as HTML even when storage metadata is text/plain', async () => {
    mocks.createAdminClient.mockResolvedValue(createAdminWithAsset('draft'));
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: true,
    });
    mocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new TextEncoder().encode('<!DOCTYPE html><html></html>'),
      contentType: 'text/plain;charset=UTF-8',
    });

    const response = await callRoute(['index.html']);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8'
    );
    expect(response.headers.get('content-length')).toBeTruthy();
    const html = await response.text();
    expect(html).toContain(
      '<base data-tuturuuu-webgl-viewport-fill href="/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/">'
    );
    expect(html).toContain('data-tuturuuu-webgl-viewport-fill');
    expect(html).toContain('data-cfasync="false"');
    expect(html).toContain(
      '"Build/Mine Blast WebGL.loader.js":"/api/v1/workspaces/ws-1/external-projects/assets/asset-1/webgl/Build/Mine%20Blast%20WebGL.loader.js"'
    );
    expect(html).toContain('HTMLScriptElement');
    expect(html).toContain('canvas.width');
    expect(html).toContain('tuturuuu-webgl-download-status');
  });

  it('serves Unity Build resources from the same WebGL package route', async () => {
    mocks.createAdminClient.mockResolvedValue(createAdminWithAsset('draft'));
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: true,
    });
    mocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new TextEncoder().encode('createUnityInstance();'),
      contentType: 'text/plain;charset=UTF-8',
    });

    const response = await callRoute(['Build', 'Mine Blast WebGL.loader.js']);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'application/javascript; charset=utf-8'
    );
    await expect(response.text()).resolves.toBe('createUnityInstance();');
    expect(
      mocks.downloadWorkspaceStorageObjectForProvider
    ).toHaveBeenCalledWith(
      'ws-1',
      'supabase',
      'external-projects/yoola/games/mine/webgl-packages/package/Mine Blast WebGL/Build/Mine Blast WebGL.loader.js'
    );
  });

  it('serves Unity splash images with image content types', async () => {
    mocks.createAdminClient.mockResolvedValue(createAdminWithAsset('draft'));
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: true,
    });
    mocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new Uint8Array([1, 2, 3]),
      contentType: 'application/octet-stream',
    });

    const response = await callRoute(['Build', 'Mine Blast WebGL.jpg']);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });

  it('prevents path traversal outside the WebGL package root', async () => {
    mocks.createAdminClient.mockResolvedValue(
      createAdminWithAsset('published')
    );

    const response = await callRoute(['..', 'secrets.txt']);

    expect(response.status).toBe(400);
    expect(
      mocks.downloadWorkspaceStorageObjectForProvider
    ).not.toHaveBeenCalled();
  });
});
