import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listWorkspaceStorageDirectory: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  listWorkspaceStorageDirectory: mocks.listWorkspaceStorageDirectory,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {},
}));
vi.mock('@/legacy-api-routes/v1/workspaces/[wsId]/storage/route-auth', () => ({
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS: [],
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageRouteAuth: mocks.resolveWorkspaceStorageRouteAuth,
}));

import { GET } from './route';

beforeEach(() => {
  mocks.listWorkspaceStorageDirectory.mockReset().mockResolvedValue({
    data: [],
    total: 0,
  });
  mocks.resolveWorkspaceStorageRouteAuth.mockReset().mockResolvedValue({
    ok: true,
    context: {
      normalizedWsId: 'workspace-test',
      permissions: { withoutPermission: () => false },
      supabase: {},
      userId: 'user-test',
    },
  });
});

it.each(['50% done', 'docs/', '/docs'])(
  'preserves legacy list path compatibility for %j',
  async (path) => {
    const response = await GET(
      new NextRequest(
        `https://example.test/api/v1/workspaces/workspace-test/storage/list?path=${encodeURIComponent(path)}`
      ),
      { params: Promise.resolve({ wsId: 'workspace-test' }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.listWorkspaceStorageDirectory).toHaveBeenCalledWith(
      'workspace-test',
      expect.objectContaining({
        path: path === '50% done' ? path : 'docs',
      })
    );
  }
);

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

it.each([
  'chats',
  'chats/ai/resources/member-a-mind-thread',
  'chats/conversation-a',
])('denies private directory %s before listing', async (path) => {
  const response = await GET(
    new NextRequest(
      `https://example.test/api/v1/workspaces/workspace-test/storage/list?path=${encodeURIComponent(path)}`
    ),
    { params: Promise.resolve({ wsId: 'workspace-test' }) }
  );
  expect(response.status).toBe(403);
  expect(mocks.listWorkspaceStorageDirectory).not.toHaveBeenCalled();
});

it('filters private namespaces out of the root response', async () => {
  mocks.listWorkspaceStorageDirectory.mockResolvedValue({
    data: [{ name: 'chats' }, { name: 'documents' }],
    total: 2,
  });
  const response = await GET(
    new NextRequest(
      'https://example.test/api/v1/workspaces/workspace-test/storage/list'
    ),
    { params: Promise.resolve({ wsId: 'workspace-test' }) }
  );
  expect(await response.json()).toMatchObject({
    data: [{ name: 'documents' }],
  });
});
