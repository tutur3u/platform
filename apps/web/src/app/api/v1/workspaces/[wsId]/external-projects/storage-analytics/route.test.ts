import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorkspaceStorageOverview: vi.fn(),
  listWorkspaceStorageRawObjectsForProvider: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
  getWorkspaceStorageOverview: (
    ...args: Parameters<typeof mocks.getWorkspaceStorageOverview>
  ) => mocks.getWorkspaceStorageOverview(...args),
  listWorkspaceStorageRawObjectsForProvider: (
    ...args: Parameters<typeof mocks.listWorkspaceStorageRawObjectsForProvider>
  ) => mocks.listWorkspaceStorageRawObjectsForProvider(...args),
}));

function createRequest() {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/external-projects/storage-analytics'
  );
}

async function getStorageAnalytics() {
  const { GET } = await import('./route');

  return GET(createRequest(), {
    params: Promise.resolve({ wsId: 'workspace-1' }),
  });
}

describe('external project storage analytics route', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.requireWorkspaceExternalProjectAccess.mockReset();
    mocks.getWorkspaceStorageOverview.mockReset();
    mocks.listWorkspaceStorageRawObjectsForProvider.mockReset();
    mocks.serverLoggerError.mockReset();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      binding: {
        adapter: 'kendra',
      },
      normalizedWorkspaceId: 'workspace-1',
      ok: true,
    });
    mocks.getWorkspaceStorageOverview.mockResolvedValue({
      fileCount: 100,
      largestFile: null,
      provider: 'supabase',
      smallestFile: null,
      storageLimit: 10_240,
      totalSize: 9000,
    });
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValue([
      {
        fullPath: 'workspace-1/external-projects/kendra/voice-reels/demo.mp3',
        isFolderPlaceholder: false,
        path: 'external-projects/kendra/voice-reels/demo.mp3',
        size: 4096,
        updatedAt: '2026-04-19T01:00:00.000Z',
      },
      {
        fullPath:
          'workspace-1/external-projects/kendra/voice-reels/session-note.txt',
        isFolderPlaceholder: false,
        path: 'external-projects/kendra/voice-reels/session-note.txt',
        size: 24,
        updatedAt: '2026-04-19T02:00:00.000Z',
      },
      {
        fullPath:
          'workspace-1/external-projects/kendra/voice-reels/.emptyFolderPlaceholder',
        isFolderPlaceholder: true,
        path: 'external-projects/kendra/voice-reels/.emptyFolderPlaceholder',
        size: 0,
        updatedAt: '2026-04-19T03:00:00.000Z',
      },
    ]);
  });

  it('returns external-project storage analytics for the linked adapter prefix', async () => {
    const response = await getStorageAnalytics();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        fileCount: 2,
        largestFile: {
          createdAt: '2026-04-19T01:00:00.000Z',
          name: 'demo.mp3',
          size: 4096,
        },
        smallestFile: {
          createdAt: '2026-04-19T02:00:00.000Z',
          name: 'session-note.txt',
          size: 24,
        },
        storageLimit: 10_240,
        totalSize: 4120,
        usagePercentage: 40.23,
      },
    });
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'read',
      request: expect.any(Request),
      wsId: 'workspace-1',
    });
    expect(
      mocks.listWorkspaceStorageRawObjectsForProvider
    ).toHaveBeenCalledWith('workspace-1', 'supabase', {
      pathPrefix: 'external-projects/kendra',
    });
  });

  it('returns the external-project access failure response', async () => {
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await getStorageAnalytics();

    expect(response.status).toBe(403);
    expect(mocks.getWorkspaceStorageOverview).not.toHaveBeenCalled();
  });

  it('returns empty analytics when the external project has no files', async () => {
    mocks.listWorkspaceStorageRawObjectsForProvider.mockResolvedValueOnce([]);

    const response = await getStorageAnalytics();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        fileCount: 0,
        largestFile: null,
        smallestFile: null,
        storageLimit: 10_240,
        totalSize: 0,
        usagePercentage: 0,
      },
    });
  });
});
