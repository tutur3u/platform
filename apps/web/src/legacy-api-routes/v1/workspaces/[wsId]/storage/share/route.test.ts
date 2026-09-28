import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  canAccessFinanceTransactionStoragePath: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

vi.mock('../route-auth', () => ({
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS: ['drive', 'finance'],
  logWorkspaceStorageRouteError: vi.fn(),
  resolveWorkspaceStorageRouteAuth: mocks.resolveWorkspaceStorageRouteAuth,
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl:
    mocks.createWorkspaceStorageSignedReadUrl,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
}));

vi.mock('@tuturuuu/finance-core/storage-access', () => ({
  canAccessFinanceTransactionStoragePath:
    mocks.canAccessFinanceTransactionStoragePath,
}));

const params = { params: Promise.resolve({ wsId: 'ws-123' }) };

function shareRequest(path: string) {
  return new Request(
    `http://localhost/api/v1/workspaces/ws-123/storage/share?path=${encodeURIComponent(path)}`
  );
}

describe('workspace storage share app session audience', () => {
  beforeEach(() => {
    mocks.canAccessFinanceTransactionStoragePath.mockReset();
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);
    mocks.createWorkspaceStorageSignedReadUrl.mockReset();
    mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(
      'https://storage.example/signed-media'
    );
    mocks.resolveWorkspaceStorageRouteAuth.mockReset();
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    });
  });

  it('accepts Tasks app sessions for task media paths', async () => {
    const response = await GET(shareRequest('task-images/media.png'), params);

    expect(response.status).toBe(401);
    expect(mocks.resolveWorkspaceStorageRouteAuth).toHaveBeenCalledWith(
      expect.any(Request),
      'ws-123',
      { appSessionTargets: ['drive', 'finance', 'tasks'] }
    );
  });

  it('does not accept Tasks app sessions for unrelated storage paths', async () => {
    await GET(shareRequest('finance/receipt.pdf'), params);

    expect(mocks.resolveWorkspaceStorageRouteAuth).toHaveBeenCalledWith(
      expect.any(Request),
      'ws-123',
      { appSessionTargets: ['drive', 'finance'] }
    );
  });

  it('rejects traversal before choosing an app session audience', async () => {
    const response = await GET(
      shareRequest('task-images/../finance/receipt.pdf'),
      params
    );

    expect(response.status).toBe(400);
    expect(mocks.resolveWorkspaceStorageRouteAuth).not.toHaveBeenCalled();
  });

  it('reads task media with the upload permission even without general Drive access', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-123',
        permissions: {
          withoutPermission: (permission: string) =>
            permission === 'view_drive',
        },
        supabase: {},
        userId: 'user-1',
      },
    });

    const response = await GET(shareRequest('task-images/media.png'), params);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://storage.example/signed-media'
    );
  });

  it('rejects task media without the task media permission', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-123',
        permissions: {
          withoutPermission: (permission: string) =>
            permission === 'manage_drive_tasks_directory',
        },
        supabase: {},
        userId: 'user-1',
      },
    });

    const response = await GET(shareRequest('task-images/media.png'), params);

    expect(response.status).toBe(403);
    expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();
  });
});
