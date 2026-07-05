import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageFolderObject: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  deleteWorkspaceStorageFolderByPath: vi.fn(),
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  listWorkspaceStorageDirectory: vi.fn(),
  renameWorkspaceStorageEntry: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  uploadWorkspaceStorageFileDirect: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageFolderObject: mocks.createWorkspaceStorageFolderObject,
  createWorkspaceStorageSignedReadUrl:
    mocks.createWorkspaceStorageSignedReadUrl,
  deleteWorkspaceStorageFolderByPath: mocks.deleteWorkspaceStorageFolderByPath,
  deleteWorkspaceStorageObjectByPath: mocks.deleteWorkspaceStorageObjectByPath,
  listWorkspaceStorageDirectory: mocks.listWorkspaceStorageDirectory,
  renameWorkspaceStorageEntry: mocks.renameWorkspaceStorageEntry,
  uploadWorkspaceStorageFileDirect: mocks.uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

type AdminMockOptions = {
  selectRows?: Array<{ id: string; storage_path: string | null }>;
};

function createAdminMock({ selectRows = [] }: AdminMockOptions = {}) {
  const calls = {
    deletes: [] as string[][],
    eq: [] as Array<[column: string, value: unknown]>,
    likes: [] as Array<[column: string, value: string]>,
    updates: [] as Array<Record<string, unknown>>,
  };

  const from = vi.fn(() => {
    let mode: 'delete' | 'select' | 'update' = 'select';
    const query = {
      delete: vi.fn(() => {
        mode = 'delete';
        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        calls.eq.push([column, value]);
        if (
          (mode === 'select' && column === 'storage_path') ||
          (mode === 'update' && column === 'id')
        ) {
          return Promise.resolve(
            mode === 'select'
              ? { data: selectRows, error: null }
              : { error: null }
          );
        }

        return query;
      }),
      in: vi.fn((_column: string, values: string[]) => {
        calls.deletes.push(values);
        return Promise.resolve({ error: null });
      }),
      like: vi.fn((column: string, value: string) => {
        calls.likes.push([column, value]);
        return Promise.resolve({ data: selectRows, error: null });
      }),
      select: vi.fn(() => {
        mode = 'select';
        return query;
      }),
      update: vi.fn((values: Record<string, unknown>) => {
        mode = 'update';
        calls.updates.push(values);
        return query;
      }),
    };

    return query;
  });

  return {
    admin: {
      from,
    },
    calls,
    from,
  };
}

function createAccess(admin = createAdminMock().admin) {
  return {
    admin,
    binding: {
      adapter: 'yashie',
    },
    normalizedWorkspaceId: 'workspace-1',
    ok: true,
    user: {
      id: 'user-1',
    },
  };
}

async function importRoute() {
  return import('./route');
}

function createJsonRequest(method: string, payload: unknown) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/external-projects/storage',
    {
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
      method,
    }
  );
}

describe('external project storage route', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }

    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue(
      createAccess()
    );
    mocks.listWorkspaceStorageDirectory.mockResolvedValue({
      data: [
        {
          id: 'file-1',
          name: 'cover.png',
          updated_at: '2026-06-09T08:00:00.000Z',
          metadata: {
            mimetype: 'image/png',
            size: 12,
          },
        },
        {
          name: 'gallery',
          metadata: {},
        },
      ],
      provider: 'supabase',
      total: 2,
    });
    mocks.createWorkspaceStorageFolderObject.mockResolvedValue({
      fullPath: 'workspace-1/external-projects/yashie/gallery',
      path: 'external-projects/yashie/gallery',
      provider: 'supabase',
    });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      fullPath: 'workspace-1/external-projects/yashie/cover.png',
      path: 'external-projects/yashie/cover.png',
      provider: 'supabase',
    });
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example.com/read'
    );
  });

  it('lists only the linked external project storage directory', async () => {
    const { GET } = await importRoute();
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/workspace-1/external-projects/storage?path=blog&limit=20'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        items: [
          {
            contentType: 'image/png',
            createdAt: null,
            kind: 'file',
            name: 'cover.png',
            path: 'blog/cover.png',
            size: 12,
            updatedAt: '2026-06-09T08:00:00.000Z',
          },
          {
            contentType: null,
            createdAt: null,
            kind: 'folder',
            name: 'gallery',
            path: 'blog/gallery',
            size: 0,
            updatedAt: null,
          },
        ],
        path: 'blog',
        provider: 'supabase',
        total: 2,
      },
    });
    expect(mocks.listWorkspaceStorageDirectory).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({
        limit: 20,
        path: 'external-projects/yashie/blog',
      })
    );
  });

  it('uploads measured multipart files into the linked external project path', async () => {
    const { POST } = await importRoute();
    const body = new FormData();
    body.set(
      'file',
      new File(['image-data'], 'cover.png', { type: 'image/png' })
    );
    body.set('path', 'gallery');
    body.set('upsert', 'true');

    const request = new Request(
      'http://localhost/api/v1/workspaces/workspace-1/external-projects/storage',
      {
        headers: {
          'Content-Type': 'multipart/form-data; boundary=test',
        },
        method: 'POST',
      }
    );
    vi.spyOn(request, 'formData').mockResolvedValue(body);

    const response = await POST(request, {
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.uploadWorkspaceStorageFileDirect).toHaveBeenCalledWith(
      'workspace-1',
      'external-projects/yashie/gallery/cover.png',
      expect.any(Uint8Array),
      {
        contentType: 'image/png',
        upsert: true,
      }
    );
  });

  it('renames files and updates linked asset paths', async () => {
    const admin = createAdminMock({
      selectRows: [
        {
          id: 'asset-1',
          storage_path: 'external-projects/yashie/blog/old.png',
        },
      ],
    });
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValueOnce(
      createAccess(admin.admin)
    );
    const { PATCH } = await importRoute();

    const response = await PATCH(
      createJsonRequest('PATCH', {
        kind: 'file',
        newName: 'new.png',
        path: 'blog/old.png',
      }),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        name: 'new.png',
        path: 'blog/new.png',
        previousPath: 'blog/old.png',
        updatedAssets: 1,
      },
    });
    expect(mocks.renameWorkspaceStorageEntry).toHaveBeenCalledWith(
      'workspace-1',
      {
        currentName: 'old.png',
        isFolder: false,
        newName: 'new.png',
        path: 'external-projects/yashie/blog',
      }
    );
    expect(admin.calls.updates).toEqual([
      {
        storage_path: 'external-projects/yashie/blog/new.png',
        updated_by: 'user-1',
      },
    ]);
  });

  it('deletes files and detaches linked assets from entries', async () => {
    const admin = createAdminMock({
      selectRows: [
        {
          id: 'asset-1',
          storage_path: 'external-projects/yashie/shop/cover.png',
        },
      ],
    });
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValueOnce(
      createAccess(admin.admin)
    );
    const { DELETE } = await importRoute();

    const response = await DELETE(
      createJsonRequest('DELETE', {
        kind: 'file',
        path: 'shop/cover.png',
      }),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        detachedAssets: 1,
        path: 'shop/cover.png',
        success: true,
      },
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'workspace-1',
      'external-projects/yashie/shop/cover.png'
    );
    expect(admin.calls.deletes).toEqual([['asset-1']]);
  });

  it('deletes folders and detaches only assets inside that folder', async () => {
    const admin = createAdminMock({
      selectRows: [
        {
          id: 'asset-1',
          storage_path: 'external-projects/yashie/blog/inside.png',
        },
        {
          id: 'asset-2',
          storage_path: 'external-projects/yashie/blog/nested/inside.png',
        },
        {
          id: 'asset-3',
          storage_path: 'external-projects/yashie/blog-roll/keep.png',
        },
      ],
    });
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValueOnce(
      createAccess(admin.admin)
    );
    const { DELETE } = await importRoute();

    const response = await DELETE(
      createJsonRequest('DELETE', {
        kind: 'folder',
        path: 'blog',
      }),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        detachedAssets: 2,
        path: 'blog',
        success: true,
      },
    });
    expect(mocks.deleteWorkspaceStorageFolderByPath).toHaveBeenCalledWith(
      'workspace-1',
      'external-projects/yashie',
      'blog'
    );
    expect(admin.calls.likes).toEqual([
      ['storage_path', 'external-projects/yashie/%'],
    ]);
    expect(admin.calls.deletes).toEqual([['asset-1', 'asset-2']]);
  });
});
