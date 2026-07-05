import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getPermissions: vi.fn(),
  getWorkspaceStorageOverview: vi.fn(),
  logWorkspaceStorageRouteError: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveWorkspaceStorageRouteAuth: vi.fn(),
}));

vi.mock('@/lib/server-supabase-client', () => ({
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

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
  getWorkspaceStorageOverview: (
    ...args: Parameters<typeof mocks.getWorkspaceStorageOverview>
  ) => mocks.getWorkspaceStorageOverview(...args),
}));

vi.mock('../route-auth', () => ({
  logWorkspaceStorageRouteError: (
    ...args: Parameters<typeof mocks.logWorkspaceStorageRouteError>
  ) => mocks.logWorkspaceStorageRouteError(...args),
  resolveWorkspaceStorageRouteAuth: (
    ...args: Parameters<typeof mocks.resolveWorkspaceStorageRouteAuth>
  ) => mocks.resolveWorkspaceStorageRouteAuth(...args),
}));

describe('workspace storage analytics route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    mocks.getPermissions.mockReset();
    mocks.getWorkspaceStorageOverview.mockReset();
    mocks.logWorkspaceStorageRouteError.mockReset();
    mocks.normalizeWorkspaceId.mockReset();
    mocks.resolveWorkspaceStorageRouteAuth.mockReset();
    mocks.createClient.mockResolvedValue({});
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-123');
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
  });

  it('returns 401 when permissions cannot be resolved', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/storage/analytics/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-123/storage/analytics'
      ),
      { params: Promise.resolve({ wsId: 'ws-123' }) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  it('returns 403 when the caller lacks manage_drive permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: (permission: string) => permission === 'manage_drive',
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/storage/analytics/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-123/storage/analytics'
      ),
      { params: Promise.resolve({ wsId: 'ws-123' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('returns workspace analytics with the same payload shape as the legacy route', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => false,
    });
    mocks.getWorkspaceStorageOverview.mockResolvedValue({
      totalSize: 5120,
      fileCount: 12,
      storageLimit: 10240,
      largestFile: {
        name: 'demo.mov',
        size: 4096,
        createdAt: '2026-04-19T01:00:00.000Z',
      },
      smallestFile: {
        name: 'tiny.txt',
        size: 24,
        createdAt: '2026-04-19T02:00:00.000Z',
      },
    });

    const { GET } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/storage/analytics/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-123/storage/analytics'
      ),
      { params: Promise.resolve({ wsId: 'ws-123' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        totalSize: 5120,
        fileCount: 12,
        storageLimit: 10240,
        usagePercentage: 50,
        largestFile: {
          name: 'demo.mov',
          size: 4096,
          createdAt: '2026-04-19T01:00:00.000Z',
        },
        smallestFile: {
          name: 'tiny.txt',
          size: 24,
          createdAt: '2026-04-19T02:00:00.000Z',
        },
      },
    });
  });
});
