import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_OBJECT_ID = '00000000-0000-0000-0000-000000000111';

const mocks = vi.hoisted(() => ({
  canAccessFinanceTransactionStoragePath: vi.fn(),
  createDynamicAdminClient: vi.fn(),
  logWorkspaceStorageRouteError: vi.fn(),
  objectQuery: undefined as any,
  resolveWorkspaceStorageRouteAuth: vi.fn(),
  storageObjectResult: undefined as any,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: (
    ...args: Parameters<typeof mocks.createDynamicAdminClient>
  ) => mocks.createDynamicAdminClient(...args),
}));

vi.mock('@/lib/finance-transaction-storage-access', () => ({
  canAccessFinanceTransactionStoragePath: (
    ...args: Parameters<typeof mocks.canAccessFinanceTransactionStoragePath>
  ) => mocks.canAccessFinanceTransactionStoragePath(...args),
}));

vi.mock('../../route-auth', () => ({
  logWorkspaceStorageRouteError: (
    ...args: Parameters<typeof mocks.logWorkspaceStorageRouteError>
  ) => mocks.logWorkspaceStorageRouteError(...args),
  resolveWorkspaceStorageRouteAuth: (
    ...args: Parameters<typeof mocks.resolveWorkspaceStorageRouteAuth>
  ) => mocks.resolveWorkspaceStorageRouteAuth(...args),
}));

function createRequest() {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/ws-1/storage/object/${VALID_OBJECT_ID}`
  );
}

function createParams(id = VALID_OBJECT_ID) {
  return {
    params: Promise.resolve({
      id,
      wsId: 'ws-1',
    }),
  };
}

function createObjectQuery() {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.single = vi.fn(async () => mocks.storageObjectResult);
  return query;
}

describe('workspace storage object by id route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.objectQuery = createObjectQuery();
    mocks.storageObjectResult = {
      data: {
        bucket_id: 'workspaces',
        created_at: '2026-05-27T00:00:00.000Z',
        id: VALID_OBJECT_ID,
        metadata: {
          mimetype: 'application/pdf',
          size: 1234,
        },
        name: 'ws-1/folder/receipt.pdf',
        updated_at: '2026-05-27T00:00:00.000Z',
      },
      error: null,
    };
    mocks.createDynamicAdminClient.mockResolvedValue({
      schema: vi.fn(() => ({
        from: vi.fn(() => mocks.objectQuery),
      })),
    });
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        userId: 'user-1',
      },
    });
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);
  });

  it('returns 400 before auth when route params are invalid', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/[id]/route'
    );

    const response = await GET(createRequest(), createParams('not-a-guid'));

    expect(response.status).toBe(400);
    expect(mocks.resolveWorkspaceStorageRouteAuth).not.toHaveBeenCalled();
  });

  it('returns object metadata for callers with Drive view access', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/[id]/route'
    );

    const response = await GET(createRequest(), createParams());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        fullPath: 'ws-1/folder/receipt.pdf',
        id: VALID_OBJECT_ID,
        path: 'folder/receipt.pdf',
      },
    });
    expect(mocks.objectQuery.eq).toHaveBeenCalledWith('id', VALID_OBJECT_ID);
    expect(mocks.canAccessFinanceTransactionStoragePath).not.toHaveBeenCalled();
  });

  it('allows finance transaction readers to access transaction attachment metadata', async () => {
    mocks.storageObjectResult.data.name =
      'ws-1/finance/transactions/tx-1/receipt.pdf';
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: vi.fn(
            (permission: string) => permission === 'view_drive'
          ),
        },
        userId: 'user-1',
      },
    });
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(true);

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/[id]/route'
    );

    const response = await GET(createRequest(), createParams());

    expect(response.status).toBe(200);
    expect(mocks.canAccessFinanceTransactionStoragePath).toHaveBeenCalledWith(
      expect.objectContaining({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1/receipt.pdf',
        userId: 'user-1',
      })
    );
  });

  it('rejects callers without Drive or finance attachment access', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: vi.fn(
            (permission: string) => permission === 'view_drive'
          ),
        },
        userId: 'user-1',
      },
    });
    mocks.canAccessFinanceTransactionStoragePath.mockResolvedValue(false);

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/[id]/route'
    );

    const response = await GET(createRequest(), createParams());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
  });

  it('forwards auth failures before querying storage metadata', async () => {
    mocks.resolveWorkspaceStorageRouteAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/storage/object/[id]/route'
    );

    const response = await GET(createRequest(), createParams());

    expect(response.status).toBe(401);
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });
});
