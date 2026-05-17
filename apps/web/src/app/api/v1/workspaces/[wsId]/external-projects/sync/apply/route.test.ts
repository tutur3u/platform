import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyWorkspaceExternalProjectSyncManifest: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/sync', () => ({
  applyWorkspaceExternalProjectSyncManifest: (
    ...args: Parameters<typeof mocks.applyWorkspaceExternalProjectSyncManifest>
  ) => mocks.applyWorkspaceExternalProjectSyncManifest(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
  withRequestLogDrain: (_meta: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

const manifest = {
  adapter: 'yoola',
  content: {
    entries: [],
  },
  schema: {
    collections: [
      {
        collection_type: 'artworks',
        slug: 'artworks',
        title: 'Artworks',
      },
    ],
  },
  version: 1,
};

describe('external project sync apply route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: {},
      binding: {
        adapter: 'yoola',
        canonical_id: 'yoola-main',
      },
      normalizedWorkspaceId: 'ws-1',
      ok: true,
      user: {
        id: 'user-1',
      },
    });
  });

  it('requires manage access before applying a manifest', async () => {
    mocks.applyWorkspaceExternalProjectSyncManifest.mockResolvedValue({
      applied: true,
      diff: {
        hasDestructiveOperations: false,
        operations: [],
        summary: {
          archive: 0,
          create: 0,
          delete: 0,
          noop: 0,
          update: 0,
        },
      },
      snapshot: {
        adapter: 'yoola',
        canonicalProjectId: 'yoola-main',
        content: {
          entries: [],
        },
        generatedAt: '2026-05-09T00:00:00.000Z',
        schema: manifest.schema,
        version: 1,
        workspaceId: 'ws-1',
      },
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/sync/apply/route'
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/sync/apply',
        {
          body: JSON.stringify({ force: true, manifest }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'manage',
      request: expect.any(Request),
      wsId: 'ws-1',
    });
    expect(
      mocks.applyWorkspaceExternalProjectSyncManifest
    ).toHaveBeenCalledWith(
      {
        actorId: 'user-1',
        binding: {
          adapter: 'yoola',
          canonical_id: 'yoola-main',
        },
        force: true,
        manifest,
        workspaceId: 'ws-1',
      },
      {}
    );
    expect(response.status).toBe(200);
  });

  it('returns 409 when destructive operations are not force-confirmed', async () => {
    mocks.applyWorkspaceExternalProjectSyncManifest.mockRejectedValue(
      new Error(
        'External project sync contains destructive operations. Re-run with force to apply.'
      )
    );

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/sync/apply/route'
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/sync/apply',
        {
          body: JSON.stringify({ manifest }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error:
        'External project sync contains destructive operations. Re-run with force to apply.',
    });
  });

  it('rejects manifests with non-external-project storage paths', async () => {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/external-projects/sync/apply/route'
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/external-projects/sync/apply',
        {
          body: JSON.stringify({
            manifest: {
              ...manifest,
              content: {
                entries: [
                  {
                    assets: [
                      {
                        assetType: 'image',
                        storagePath: 'finance/private-payroll.csv',
                      },
                    ],
                    collectionSlug: 'artworks',
                    slug: 'cover',
                    title: 'Cover',
                  },
                ],
              },
            },
          }),
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    expect(
      mocks.applyWorkspaceExternalProjectSyncManifest
    ).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid external project sync manifest',
    });
  });
});
