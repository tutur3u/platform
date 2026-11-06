import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceStorageFolderObject: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageFolderObject: mocks.createWorkspaceStorageFolderObject,
  deleteWorkspaceStorageFolderByPath: vi.fn(),
  WorkspaceStorageError: class WorkspaceStorageError extends Error {},
}));
vi.mock('../route-auth', () => ({
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageRouteAuth: mocks.resolveWorkspaceStorageRouteAuth,
}));

import { DELETE, POST } from './route';

beforeEach(() => {
  mocks.createWorkspaceStorageFolderObject.mockReset().mockResolvedValue({
    path: 'docs/new-folder',
    fullPath: 'workspace-test/docs/new-folder',
  });
  mocks.resolveWorkspaceStorageRouteAuth.mockReset().mockResolvedValue({
    ok: true,
    context: {
      normalizedWsId: 'workspace-test',
      permissions: { withoutPermission: () => false },
    },
  });
});

it.each(['50% done', 'docs/', '/docs', 'mira'])(
  'preserves legacy folder parent path compatibility for %j',
  async (path) => {
    const response = await POST(
      new NextRequest(
        'https://example.test/api/v1/workspaces/workspace-test/storage/folders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, name: 'new-folder' }),
        }
      ),
      { params: Promise.resolve({ wsId: 'workspace-test' }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.createWorkspaceStorageFolderObject).toHaveBeenCalledWith(
      'workspace-test',
      ['50% done', 'mira'].includes(path) ? path : 'docs',
      'new-folder'
    );
  }
);

it('denies creating or deleting the mira/images folder', async () => {
  for (const handler of [POST, DELETE]) {
    const response = await handler(
      new NextRequest('https://example.test/api/storage/folders', {
        method: handler === POST ? 'POST' : 'DELETE',
        body: JSON.stringify({ path: 'mira', name: 'images' }),
      }),
      { params: Promise.resolve({ wsId: 'workspace-test' }) }
    );
    expect(response.status).toBe(403);
  }
});
