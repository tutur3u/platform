import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
  getSecrets: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: (
    ...args: Parameters<typeof mocks.createDynamicAdminClient>
  ) => mocks.createDynamicAdminClient(...args),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: (...args: Parameters<typeof mocks.getSecrets>) =>
    mocks.getSecrets(...args),
}));

describe('workspace storage provider', () => {
  beforeEach(() => {
    mocks.createDynamicAdminClient.mockReset();
    mocks.getSecrets.mockReset();
    mocks.getSecrets.mockResolvedValue([]);
  });

  it('deletes Supabase-backed folders by recursively listing nested objects', async () => {
    const listMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          { id: 'placeholder', name: '.emptyFolderPlaceholder' },
          { name: 'nested' },
          { id: 'cover', name: 'cover.png' },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'detail', name: 'detail.png' }],
        error: null,
      });
    const removeMock = vi.fn().mockResolvedValue({ error: null });
    const fromMock = vi.fn(() => ({
      list: listMock,
      remove: removeMock,
    }));

    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: {
        from: fromMock,
      },
    });

    const { deleteWorkspaceStorageFolderByPath } = await import(
      './workspace-storage-provider'
    );

    await expect(
      deleteWorkspaceStorageFolderByPath('ws-1', '', 'assets')
    ).resolves.toEqual({
      deleted: 3,
      provider: 'supabase',
    });

    expect(listMock).toHaveBeenNthCalledWith(1, 'ws-1/assets', {
      limit: 1000,
      offset: 0,
      sortBy: {
        column: 'name',
        order: 'asc',
      },
    });
    expect(listMock).toHaveBeenNthCalledWith(2, 'ws-1/assets/nested', {
      limit: 1000,
      offset: 0,
      sortBy: {
        column: 'name',
        order: 'asc',
      },
    });
    expect(removeMock).toHaveBeenCalledWith([
      'ws-1/assets/.emptyFolderPlaceholder',
      'ws-1/assets/nested/detail.png',
      'ws-1/assets/cover.png',
    ]);
  });

  it('returns 404 when the Supabase-backed folder has no objects', async () => {
    const listMock = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });

    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: {
        from: vi.fn(() => ({
          list: listMock,
          remove: vi.fn(),
        })),
      },
    });

    const { deleteWorkspaceStorageFolderByPath } = await import(
      './workspace-storage-provider'
    );

    await expect(
      deleteWorkspaceStorageFolderByPath('ws-1', '', 'missing')
    ).rejects.toMatchObject({
      message: 'Folder not found',
      status: 404,
    });
  });

  it('creates Supabase signed upload URLs without querying the storage schema', async () => {
    const listMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: [],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });
    const createSignedUploadUrlMock = vi.fn().mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.com/upload',
        token: 'upload-token',
      },
      error: null,
    });
    const schemaMock = vi.fn(() => {
      throw new Error('storage schema should not be queried');
    });
    const rpcMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: 104857600,
        error: null,
      })
      .mockResolvedValueOnce({
        data: 104857600,
        error: null,
      });

    mocks.createDynamicAdminClient.mockResolvedValue({
      rpc: rpcMock,
      schema: schemaMock,
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: createSignedUploadUrlMock,
          list: listMock,
        })),
      },
    });

    const { createWorkspaceStorageUploadPayload } = await import(
      './workspace-storage-provider'
    );

    await expect(
      createWorkspaceStorageUploadPayload('ws-1', 'build.zip', {
        contentType: 'application/zip',
        path: 'games/mine',
        size: 123,
      })
    ).resolves.toMatchObject({
      contentType: 'application/zip',
      filename: 'build.zip',
      fullPath: 'ws-1/games/mine/build.zip',
      path: 'games/mine/build.zip',
      provider: 'supabase',
      signedUrl: 'https://storage.example.com/upload',
      token: 'upload-token',
    });

    expect(listMock).toHaveBeenNthCalledWith(1, 'ws-1/games/mine', {
      limit: 1000,
      offset: 0,
      search: 'build.zip',
      sortBy: {
        column: 'name',
        order: 'asc',
      },
    });
    expect(createSignedUploadUrlMock).toHaveBeenCalledWith(
      'ws-1/games/mine/build.zip',
      {
        upsert: false,
      }
    );
    expect(schemaMock).not.toHaveBeenCalled();
  });

  it('rejects zero-byte declared upload sizes before signing upload URLs', async () => {
    const listMock = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const createSignedUploadUrlMock = vi.fn().mockResolvedValue({
      data: {
        signedUrl: 'https://storage.example.com/upload',
        token: 'upload-token',
      },
      error: null,
    });

    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: createSignedUploadUrlMock,
          list: listMock,
        })),
      },
    });

    const { createWorkspaceStorageUploadPayload } = await import(
      './workspace-storage-provider'
    );

    await expect(
      createWorkspaceStorageUploadPayload('ws-1', 'empty.pdf', {
        contentType: 'application/pdf',
        path: 'finance/transactions/tx-1',
        size: 0,
      })
    ).rejects.toMatchObject({
      message: 'A valid file size is required for storage uploads.',
      status: 400,
    });
    expect(createSignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('lists Supabase raw objects recursively without querying the storage schema', async () => {
    const listMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            name: 'Mine Blast WebGL',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'index',
            metadata: {
              mimetype: 'text/html',
              size: 4853,
            },
            name: 'index.html',
            updated_at: '2026-04-25T00:00:00.000Z',
          },
          {
            id: 'data',
            metadata: {
              mimeType: 'application/octet-stream',
              size: '22387152',
            },
            name: 'Build.data',
            updated_at: '2026-04-25T00:00:01.000Z',
          },
        ],
        error: null,
      });
    const schemaMock = vi.fn(() => {
      throw new Error('storage schema should not be queried');
    });

    mocks.createDynamicAdminClient.mockResolvedValue({
      schema: schemaMock,
      storage: {
        from: vi.fn(() => ({
          list: listMock,
        })),
      },
    });

    const { listWorkspaceStorageRawObjectsForProvider } = await import(
      './workspace-storage-provider'
    );

    await expect(
      listWorkspaceStorageRawObjectsForProvider('ws-1', 'supabase', {
        pathPrefix: 'external-projects/yoola/games/mine/webgl-packages/build',
      })
    ).resolves.toEqual([
      {
        contentType: 'text/html',
        fullPath:
          'ws-1/external-projects/yoola/games/mine/webgl-packages/build/Mine Blast WebGL/index.html',
        isFolderPlaceholder: false,
        path: 'external-projects/yoola/games/mine/webgl-packages/build/Mine Blast WebGL/index.html',
        size: 4853,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        contentType: 'application/octet-stream',
        fullPath:
          'ws-1/external-projects/yoola/games/mine/webgl-packages/build/Mine Blast WebGL/Build.data',
        isFolderPlaceholder: false,
        path: 'external-projects/yoola/games/mine/webgl-packages/build/Mine Blast WebGL/Build.data',
        size: 22_387_152,
        updatedAt: '2026-04-25T00:00:01.000Z',
      },
    ]);

    expect(listMock).toHaveBeenNthCalledWith(
      1,
      'ws-1/external-projects/yoola/games/mine/webgl-packages/build',
      {
        limit: 1000,
        offset: 0,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      }
    );
    expect(listMock).toHaveBeenNthCalledWith(
      2,
      'ws-1/external-projects/yoola/games/mine/webgl-packages/build/Mine Blast WebGL',
      {
        limit: 1000,
        offset: 0,
        sortBy: {
          column: 'name',
          order: 'asc',
        },
      }
    );
    expect(schemaMock).not.toHaveBeenCalled();
  });

  it('blocks generic writes to the mobile deployment vault', async () => {
    const { uploadWorkspaceStorageFileDirectToProvider } = await import(
      './workspace-storage-provider'
    );

    await expect(
      uploadWorkspaceStorageFileDirectToProvider(
        ROOT_WORKSPACE_ID,
        'supabase',
        '.tuturuuu/mobile-deployment-vault/version/file.ciphertext.json',
        new Uint8Array([1]),
        { contentType: 'application/json', upsert: true }
      )
    ).rejects.toMatchObject({
      message:
        'Mobile deployment vault files are managed by the mobile deployment API.',
      status: 403,
    });
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });

  it('allows explicit internal writes to the mobile deployment vault', async () => {
    const uploadMock = vi.fn().mockResolvedValue({
      data: {
        fullPath:
          '00000000-0000-0000-0000-000000000000/.tuturuuu/mobile-deployment-vault/version/file.ciphertext.json',
        path: '00000000-0000-0000-0000-000000000000/.tuturuuu/mobile-deployment-vault/version/file.ciphertext.json',
      },
      error: null,
    });

    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: {
        from: vi.fn(() => ({
          upload: uploadMock,
        })),
      },
    });

    const { uploadWorkspaceStorageFileDirectToProvider } = await import(
      './workspace-storage-provider'
    );

    await expect(
      uploadWorkspaceStorageFileDirectToProvider(
        ROOT_WORKSPACE_ID,
        'supabase',
        '.tuturuuu/mobile-deployment-vault/version/file.ciphertext.json',
        new Uint8Array([1]),
        {
          allowReservedMobileDeploymentVault: true,
          contentType: 'application/json',
          skipCapacityCheck: true,
          upsert: true,
        }
      )
    ).resolves.toMatchObject({
      path: '.tuturuuu/mobile-deployment-vault/version/file.ciphertext.json',
      provider: 'supabase',
    });
  });

  it('filters mobile deployment vault objects from raw listings', async () => {
    const listMock = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          { name: '.tuturuuu' },
          {
            id: 'public',
            metadata: { mimetype: 'text/plain', size: 1 },
            name: 'public.txt',
            updated_at: '2026-06-14T00:00:00.000Z',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ name: 'mobile-deployment-vault' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ name: 'version' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'secret',
            metadata: { mimetype: 'application/json', size: 32 },
            name: 'file.ciphertext.json',
            updated_at: '2026-06-14T00:00:01.000Z',
          },
        ],
        error: null,
      });

    mocks.createDynamicAdminClient.mockResolvedValue({
      storage: {
        from: vi.fn(() => ({
          list: listMock,
        })),
      },
    });

    const { listWorkspaceStorageRawObjectsForProvider } = await import(
      './workspace-storage-provider'
    );

    await expect(
      listWorkspaceStorageRawObjectsForProvider(ROOT_WORKSPACE_ID, 'supabase')
    ).resolves.toEqual([
      {
        contentType: 'text/plain',
        fullPath: `${ROOT_WORKSPACE_ID}/public.txt`,
        isFolderPlaceholder: false,
        path: 'public.txt',
        size: 1,
        updatedAt: '2026-06-14T00:00:00.000Z',
      },
    ]);
  });
});
