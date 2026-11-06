import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: mocks.client,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getSecrets: vi.fn(async () => []),
}));

import {
  deleteWorkspaceStorageFolderByPath,
  listWorkspaceStorageDirectory,
  renameWorkspaceStorageEntry,
} from './workspace-storage-provider';

function setup({ images = false } = {}) {
  const list = vi.fn(async (path: string) => ({
    data:
      path === 'ws-1/mira' || path === 'ws-1/documents'
        ? [
            { id: 'notes', name: 'notes.txt', metadata: { size: 5 } },
            ...(images ? [{ name: 'images' }] : []),
          ]
        : path.endsWith('/images')
          ? [{ id: 'private', name: 'private.png', metadata: { size: 5 } }]
          : [],
    error: null,
  }));
  const move = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  mocks.client.mockResolvedValue({
    storage: { from: () => ({ list, move, remove }) },
  });
  return { move, remove };
}
beforeEach(() => vi.clearAllMocks());

it('allows ordinary mira folder renames and deletes', async () => {
  const { move, remove } = setup();
  await renameWorkspaceStorageEntry('ws-1', {
    currentName: 'mira',
    newName: 'archive',
    isFolder: true,
    driveOnly: true,
  });
  expect(move).toHaveBeenCalledWith(
    'ws-1/mira/notes.txt',
    'ws-1/archive/notes.txt'
  );
  await deleteWorkspaceStorageFolderByPath('ws-1', '', 'mira', {
    driveOnly: true,
  });
  expect(remove).toHaveBeenCalledWith(['ws-1/mira/notes.txt']);
});
it('rejects parent mira mutations before touching any private descendant', async () => {
  const { move, remove } = setup({ images: true });
  await expect(
    renameWorkspaceStorageEntry('ws-1', {
      currentName: 'mira',
      newName: 'archive',
      isFolder: true,
      driveOnly: true,
    })
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    deleteWorkspaceStorageFolderByPath('ws-1', '', 'mira', { driveOnly: true })
  ).rejects.toMatchObject({ status: 403 });
  expect(move).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});
it('rejects a folder rename that would create mira/images', async () => {
  const { move } = setup({ images: true });
  await expect(
    renameWorkspaceStorageEntry('ws-1', {
      currentName: 'documents',
      newName: 'mira',
      isFolder: true,
      driveOnly: true,
    })
  ).rejects.toMatchObject({ status: 403 });
  expect(move).not.toHaveBeenCalled();
});
it('preserves an owning application deletion without Drive access mode', async () => {
  const { remove } = setup({ images: true });
  await deleteWorkspaceStorageFolderByPath('ws-1', 'mira', 'images');
  expect(remove).toHaveBeenCalledWith(['ws-1/mira/images/private.png']);
});

it('excludes private image children from Mira directory data and pagination', async () => {
  setup({ images: true });
  const result = await listWorkspaceStorageDirectory('ws-1', { path: 'mira' });
  expect(result).toMatchObject({ data: [{ name: 'notes.txt' }], total: 1 });
});
