import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canAccessFinanceTransactionStoragePath: vi.fn(),
  createClient: vi.fn(),
  deleteWorkspaceStorageObjectByPath: vi.fn(),
  getPermissions: vi.fn(),
  logWorkspaceStorageRouteError: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

vi.mock('@/lib/finance-transaction-storage-access', () => ({
  canAccessFinanceTransactionStoragePath: (
    ...args: Parameters<typeof mocks.canAccessFinanceTransactionStoragePath>
  ) => mocks.canAccessFinanceTransactionStoragePath(...args),
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
  deleteWorkspaceStorageObjectByPath: (
    ...args: Parameters<typeof mocks.deleteWorkspaceStorageObjectByPath>
  ) => mocks.deleteWorkspaceStorageObjectByPath(...args),
}));

vi.mock('../route-auth', () => ({
  FINANCE_TRANSACTION_STORAGE_APP_SESSION_TARGETS: ['drive', 'finance'],
  logWorkspaceStorageRouteError: (
    ...args: Parameters<typeof mocks.logWorkspaceStorageRouteError>
  ) => mocks.logWorkspaceStorageRouteError(...args),
  resolveWorkspaceStorageRouteAuth: (
    ...args: Parameters<typeof mocks.resolveWorkspaceStorageRouteAuth>
  ) => mocks.resolveWorkspaceStorageRouteAuth(...args),
}));

function createRequest(path: string) {
  return new NextRequest(
    'http://localhost/api/v1/workspaces/ws-1/storage/object',
    {
      method: 'DELETE',
      body: JSON.stringify({ path }),
    }
  );
}

describe('workspace storage object route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.createClient.mockResolvedValue({});
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: {
        id: 'user-1',
      },
      authError: null,
    });
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.resolveWorkspaceStorageRouteAuth.mockImplementation(
      async (_request: Request, wsId: string) => {
        const normalizedWsId = await mocks.normalizeWorkspaceId(wsId);
        const permissions = await mocks.getPermissions();

        if (!permissions) {
          return {
            ok: false,
            response: NextResponse.json(
              { message: 'Unauthorized' },
              { status: 401 }
            ),
          };
        }

        return {
          ok: true,
          context: {
            normalizedWsId,
            permissions,
            user: {
              id: 'user-1',
            },
            userId: 'user-1',
          },
        };
      }
    );
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);
    mocks.deleteWorkspaceStorageObjectByPath.mockResolvedValue({
      provider: 'supabase',
    });
  });

  it('deletes storage objects for workspace Drive managers', async () => {
    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/route'
    );

    const response = await DELETE(createRequest('folder/receipt.pdf'), {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'ws-1',
      'folder/receipt.pdf'
    );
    expect(mocks.canAccessFinanceTransactionStoragePath).not.toHaveBeenCalled();
  });

  it('allows finance transaction writers to remove transaction attachments', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(
        (permission: string) => permission === 'manage_drive'
      ),
    });
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(true);

    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/route'
    );

    const response = await DELETE(
      createRequest('ws-1/finance/transactions/tx-1/receipt.pdf'),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.canAccessFinanceTransactionStoragePath).toHaveBeenCalledWith(
      expect.objectContaining({
        access: 'write',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1/receipt.pdf',
        userId: 'user-1',
      })
    );
    expect(mocks.deleteWorkspaceStorageObjectByPath).toHaveBeenCalledWith(
      'ws-1',
      'finance/transactions/tx-1/receipt.pdf'
    );
  });

  it('rejects callers without Drive or finance transaction attachment access', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(
        (permission: string) => permission === 'manage_drive'
      ),
    });
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);

    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/route'
    );

    const response = await DELETE(
      createRequest('finance/transactions/tx-1/receipt.pdf'),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.deleteWorkspaceStorageObjectByPath).not.toHaveBeenCalled();
  });

  it('rejects deletes against the reserved mobile deployment vault path', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue(ROOT_WORKSPACE_ID);

    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/route'
    );

    const response = await DELETE(
      createRequest('.tuturuuu/mobile-deployment-vault/version/file.json'),
      {
        params: Promise.resolve({ wsId: 'root' }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(mocks.canAccessFinanceTransactionStoragePath).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspaceStorageObjectByPath).not.toHaveBeenCalled();
  });
});
