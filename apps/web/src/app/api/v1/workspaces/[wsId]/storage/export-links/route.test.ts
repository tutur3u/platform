import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageExportAssetUrl: vi.fn(
    ({ relativePath }: { relativePath: string }) =>
      `https://exports.example.com/${relativePath}`
  ),
  createWorkspaceStorageExportToken: vi.fn(() => 'export-token'),
  listWorkspaceStorageRawObjectsForProvider: vi.fn(),
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageProvider: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

vi.mock('@/lib/workspace-storage-export-links', () => ({
  createWorkspaceStorageExportAssetUrl: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageExportAssetUrl>
  ) => mocks.createWorkspaceStorageExportAssetUrl(...args),
  createWorkspaceStorageExportToken: (
    ...args: Parameters<typeof mocks.createWorkspaceStorageExportToken>
  ) => mocks.createWorkspaceStorageExportToken(...args),
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  listWorkspaceStorageRawObjectsForProvider: (
    ...args: Parameters<typeof mocks.listWorkspaceStorageRawObjectsForProvider>
  ) => mocks.listWorkspaceStorageRawObjectsForProvider(...args),
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

vi.mock('../route-auth', () => ({
  logWorkspaceStorageRouteError: mocks.logWorkspaceStorageRouteError,
  resolveWorkspaceStorageRouteAuth: (
    ...args: Parameters<typeof mocks.resolveWorkspaceStorageRouteAuth>
  ) => mocks.resolveWorkspaceStorageRouteAuth(...args),
}));

function createPermissions({ manageDrive = true } = {}) {
  return {
    withoutPermission: (permission: string) =>
      permission === 'manage_drive' ? !manageDrive : true,
  };
}

function createRawObject(path: string, isFolderPlaceholder = false) {
  return {
    contentType: 'text/plain',
    fullPath: `workspace-1/${path}`,
    isFolderPlaceholder,
    path,
    size: 123,
    updatedAt: '2026-06-15T00:00:00.000Z',
  };
}

function setupAuth({ manageDrive = true } = {}) {
  mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
    ok: true,
    context: {
      normalizedWsId: 'workspace-1',
      permissions: createPermissions({ manageDrive }),
    },
  });
}

async function postExportLinks(path = 'exports/site') {
  const { POST } = await import('./route');
  return POST(
    new Request(
      'http://localhost/api/v1/workspaces/workspace-1/storage/export-links',
      {
        body: JSON.stringify({ path }),
        method: 'POST',
      }
    ),
    {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    }
  );
}

describe('workspace storage export-links route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createWorkspaceStorageExportAssetUrl.mockClear();
    mocks.createWorkspaceStorageExportToken.mockClear();
    mocks.listWorkspaceStorageRawObjectsForProvider.mockReset();
    mocks.logWorkspaceStorageRouteError.mockReset();
    mocks.resolveWorkspaceStorageProvider.mockReset();
    mocks.resolveWorkspaceStorageRouteAuth.mockReset();

    setupAuth();
    mocks.resolveWorkspaceStorageProvider.mockResolvedValue({
      misconfigured: false,
      provider: 'supabase',
    });
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValue([
      createRawObject('exports/site/index.html'),
      createRawObject('exports/site/assets/app.css'),
      createRawObject('exports/site/empty/.emptyFolderPlaceholder', true),
    ]);
  });

  it('creates export links from a bounded raw object listing', async () => {
    const response = await postExportLinks();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      files: [
        {
          path: 'exports/site/index.html',
          relativePath: 'index.html',
          url: 'https://exports.example.com/index.html',
        },
        {
          path: 'exports/site/assets/app.css',
          relativePath: 'assets/app.css',
          url: 'https://exports.example.com/assets/app.css',
        },
      ],
      indexFile: {
        path: 'exports/site/index.html',
        relativePath: 'index.html',
      },
      loaderManifest: {
        entryUrl: 'https://exports.example.com/index.html',
      },
    });
    expect(
      mocks.listWorkspaceStorageRawObjectsForProvider
    ).toHaveBeenCalledExactlyOnceWith('workspace-1', 'supabase', {
      pathPrefix: 'exports/site',
      limit: 2001,
    });
  });

  it('rejects sentinel-sized listings without rerunning an unbounded export scan', async () => {
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValue(
      Array.from({ length: 2001 }, (_, index) =>
        createRawObject(
          `exports/site/placeholders/${index}/.emptyFolderPlaceholder`,
          true
        )
      )
    );

    const response = await postExportLinks();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message:
        'This folder contains too many storage entries to export at once.',
    });
    expect(
      mocks.listWorkspaceStorageRawObjectsForProvider
    ).toHaveBeenCalledTimes(1);
    expect(
      mocks.listWorkspaceStorageRawObjectsForProvider.mock.calls[0]?.[2]
    ).toEqual({
      pathPrefix: 'exports/site',
      limit: 2001,
    });
  });

  it('rejects folders with more than the exportable file cap', async () => {
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) =>
        createRawObject(`exports/site/assets/${index}.txt`)
      )
    );

    const response = await postExportLinks();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'This folder is too large to export at once.',
    });
    expect(
      mocks.listWorkspaceStorageRawObjectsForProvider
    ).toHaveBeenCalledTimes(1);
  });
});
