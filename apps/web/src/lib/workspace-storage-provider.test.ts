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
});
