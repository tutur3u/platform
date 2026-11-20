// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

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

import { publicationEventId } from '@/lib/external-projects/published-assets';
afterEach(() => vi.unstubAllGlobals());

it('proxies only eligible bytes and closes a withdrawal during the storage handoff', async () => {
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
  const proofQuery = {
    select: () => proofQuery,
    eq: () => proofQuery,
    in: async () => ({
      data: [
        {
          id: publicationEventId(
            'ws-1',
            'canonical-1',
            asset.entry_id,
            'publish',
            published_at
          ),
          entry_id: asset.entry_id,
          published_at,
          asset_revisions: { [asset.id]: updated_at },
        },
      ],
    }),
  };
  const assetQuery = {
    select: () => assetQuery,
    eq: () => assetQuery,
    single: async () => ({ data: asset }),
  };
  mocks.createAdminClient.mockResolvedValue({
    from: () => assetQuery,
    schema: () => ({ from: () => proofQuery }),
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

  const signedUrl = 'https://storage.example.test/revision';
  mocks.createWorkspaceStorageSignedReadUrl.mockResolvedValue(signedUrl);
  const upstream = vi.fn(async () =>
    Response.json('published bytes', {
      headers: { 'content-type': 'image/png' },
    })
  );
  vi.stubGlobal('fetch', upstream);
  const media = () => GET(new Request(`${url}?v=${revision}`), params);
  const response = await media();
  expect(response.status).toBe(200);
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(await response.json()).toBe('published bytes');
  expect(upstream).toHaveBeenCalledWith(
    signedUrl,
    expect.objectContaining({
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    })
  );
  expect(mocks.createWorkspaceStorageSignedReadUrl).toHaveBeenCalledWith(
    'ws-1',
    asset.storage_path,
    expect.objectContaining({ expiresIn: 15 })
  );

  upstream.mockResolvedValueOnce(
    new Response('published', {
      status: 206,
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-8/15' },
    })
  );
  const partial = await GET(
    new Request(`${url}?v=${revision}`, {
      headers: { Range: 'bytes=0-8' },
    }),
    params
  );
  expect(partial.status).toBe(206);
  expect(partial.headers.get('content-range')).toBe('bytes 0-8/15');
  expect(upstream).toHaveBeenLastCalledWith(
    signedUrl,
    expect.objectContaining({
      headers: { Range: 'bytes=0-8' },
    })
  );

  upstream.mockImplementationOnce(async () => {
    parent.status = 'draft';
    return new Response('withdrawn fixture bytes');
  });
  expect((await media()).status).toBe(404);
  expect((await probe()).status).toBe(404);
  expect(mocks.requireWorkspaceExternalProjectAccess).not.toHaveBeenCalled();
});
