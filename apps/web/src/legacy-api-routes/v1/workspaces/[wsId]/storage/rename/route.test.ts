import { beforeEach, expect, it, vi } from 'vitest';
import { PRIVATE_DRIVE_ROOTS } from '@/lib/private-drive-paths.test-fixture';

const mocks = vi.hoisted(() => ({ rename: vi.fn() }));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  renameWorkspaceStorageEntry: mocks.rename,
  WorkspaceStorageError: class extends Error {},
}));
vi.mock('../route-auth', () => ({
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(async () => ({
    ok: true,
    context: {
      normalizedWsId: 'ws-1',
      permissions: { withoutPermission: () => false },
    },
  })),
}));

import { POST } from './route';

beforeEach(() => vi.clearAllMocks());
async function rename(currentName: string, newName: string, path = '') {
  return POST(
    new Request('http://localhost/api/storage/rename', {
      method: 'POST',
      body: JSON.stringify({ path, currentName, newName, isFolder: true }),
    }),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
}

it.each(PRIVATE_DRIVE_ROOTS)(
  'denies renaming into and out of %s',
  async (root) => {
    expect((await rename(root, 'documents')).status).toBe(403);
    expect((await rename('documents', root)).status).toBe(403);
    expect(
      (await rename('private', 'exposed', `${root}/member-a`)).status
    ).toBe(403);
    expect(mocks.rename).not.toHaveBeenCalled();
  }
);
it('keeps ordinary Drive renames working', async () => {
  expect((await rename('before', 'after', 'documents')).status).toBe(200);
  expect(mocks.rename).toHaveBeenCalledExactlyOnceWith('ws-1', {
    path: 'documents',
    currentName: 'before',
    newName: 'after',
    isFolder: true,
  });
});
