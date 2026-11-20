// @vitest-environment node
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createWorkspaceStorageSignedReadUrl: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  resolveWorkspaceId: () => 'ws-1',
}));
vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess:
    mocks.requireWorkspaceExternalProjectAccess,
  resolveWorkspaceExternalProjectBinding: async () => ({
    canonical_project: { id: 'canonical-1' },
    enabled: true,
  }),
}));
vi.mock('@/lib/external-projects/store', () => ({
  deleteWorkspaceExternalProjectAsset: vi.fn(),
  updateWorkspaceExternalProjectAsset: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  WorkspaceStorageError: Error,
  createWorkspaceStorageSignedReadUrl:
    mocks.createWorkspaceStorageSignedReadUrl,
  resolveWorkspaceStorageProvider: async () => ({ provider: 'supabase' }),
}));

it('proves only the current public asset revision and signs public storage for one minute', async () => {
  const { GET, HEAD } = await import('./route');
  const updated_at = '2026-11-20T09:00:00Z';
  const published_at = '2026-11-20T10:00:00Z';
  const parent = {
    status: 'published',
    published_at,
    metadata: {},
    workspace_external_project_collections: { slug: 'games', config: {} },
  };
  const asset = {
    id: 'asset-1',
    entry_id: 'entry-1',
    updated_at,
    source_url: null,
    storage_path: 'external-projects/custom/games/index.png',
    workspace_external_project_entries: parent,
  };
  mocks.createAdminClient.mockResolvedValue({
    from: (table: string) => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      in: async () => ({ data: [] }),
      single: async () => ({ data: asset }),
      limit: async () => ({
        data:
          table === 'workspace_external_project_publish_events'
            ? [
                {
                  entry_id: asset.entry_id,
                  payload: {
                    assetPublicationAt: published_at,
                    publishedAssetManifest: { [asset.id]: updated_at },
                  },
                },
              ]
            : [],
      }),
    }),
  });
  const params = {
    params: Promise.resolve({ wsId: 'ws-1', assetId: asset.id }),
  };
  const url =
    'http://localhost/api/v1/workspaces/ws-1/external-projects/assets/asset-1';
  const revision = '20261120090000';
  const probe = (entry = asset.entry_id, version = revision) =>
    HEAD(
      new Request(`${url}?entry=${entry}&v=${version}`, { method: 'HEAD' }),
      params
    );
  const allowed = await probe();
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get('x-tuturuuu-published-asset-revision')).toBe(
    revision
  );
  expect(allowed.headers.get('vercel-cdn-cache-control')).toBe('no-store');
  expect((await probe('other-entry')).status).toBe(404);
  expect((await probe(asset.entry_id, 'old')).status).toBe(404);
  expect(mocks.createWorkspaceStorageSignedReadUrl).not.toHaveBeenCalled();

  mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValueOnce(
    'https://storage.example.test/revision'
  );
  const response = await GET(new Request(`${url}?v=${revision}`), params);
  expect(response.status).toBe(307);
  expect(response.headers.has('x-tuturuuu-published-asset-revision')).toBe(
    false
  );
  expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
    'ws-1',
    asset.storage_path,
    expect.objectContaining({ expiresIn: 60 })
  );

  parent.status = 'draft';
  expect((await probe()).status).toBe(404);
  expect(mocks.requireWorkspaceExternalProjectAccess).not.toHaveBeenCalled();
});
