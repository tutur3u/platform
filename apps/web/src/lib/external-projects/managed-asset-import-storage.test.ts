import { TAGGED_JPEG } from '@tuturuuu/storage-core/image-metadata-strip.fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  fetch: vi.fn(),
  upload: vi.fn(),
  uuid: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  deleteWorkspaceStorageObjectByPath: mocks.delete,
  uploadWorkspaceStorageFileDirect: mocks.upload,
}));
vi.mock('@tuturuuu/utils/uuid-helper', () => ({
  generateRandomUUID: mocks.uuid,
}));
vi.mock('undici', () => ({ fetch: mocks.fetch }));
vi.mock('./managed-asset-url-policy', () => ({
  closeManagedAssetDispatcher: vi.fn(async () => {}),
  createManagedAssetPinnedDispatcher: vi.fn(() => ({})),
  resolveSafeManagedAssetAddress: vi.fn(async () => ({
    address: '203.0.113.10',
    family: 4,
  })),
}));
vi.mock('./cache', () => ({
  invalidateWorkspaceExternalProjectCache: vi.fn(async () => {}),
}));

type Result = { data?: unknown; error?: { message: string } | null };

/** Chainable stand-in for the admin client: one queued result per terminal call. */
function fakeAdmin(results: Record<string, Result[]>) {
  const updates: Array<{ table: string; values: unknown }> = [];
  const from = (table: string) => {
    const next = () => {
      const queue = results[table] ?? [];
      return Promise.resolve(queue.shift() ?? { data: null, error: null });
    };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'or', 'in']) {
      chain[method] = () => chain;
    }
    chain.update = (values: unknown) => {
      updates.push({ table, values });
      return chain;
    };
    chain.single = next;
    chain.maybeSingle = next;
    chain.then = (resolve: (value: Result) => void, reject: () => void) =>
      next().then(resolve, reject);
    return chain;
  };
  return { admin: { from } as never, updates };
}

function scenario(
  assetUpdate: Result = { data: [{ id: 'asset-1' }], error: null }
) {
  return fakeAdmin({
    workspace_external_project_import_jobs: [
      {
        data: {
          adapter: 'yoola',
          id: 'job-1',
          report: { assetIds: ['asset-1'], processedAssetIds: [] },
        },
      },
      { data: { id: 'job-1', status: 'completed' } },
    ],
    workspace_external_project_assets: [
      {
        data: {
          entry_id: 'entry-1',
          id: 'asset-1',
          metadata: {},
          source_url: 'https://images.example.test/photo.jpg',
        },
      },
      assetUpdate,
    ],
    workspace_external_project_entries: [
      { data: { collection_id: 'col-1', id: 'entry-1', slug: 'demo' } },
    ],
    workspace_external_project_collections: [{ data: { slug: 'gallery' } }],
  });
}

describe('managed asset import storage keys', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.upload.mockResolvedValue({ path: 'ignored' });
    mocks.delete.mockResolvedValue(undefined);
    mocks.fetch.mockImplementation(
      async () =>
        new Response(new Uint8Array(TAGGED_JPEG), {
          headers: { 'content-type': 'image/jpeg' },
        })
    );
  });

  it('gives every import of the same bytes a fresh key and never overwrites', async () => {
    const { processManagedAssetImportJob } =
      await import('./managed-asset-import');
    mocks.uuid.mockReturnValueOnce('uuid-a').mockReturnValueOnce('uuid-b');

    for (const _ of [1, 2]) {
      const { admin } = scenario();
      await processManagedAssetImportJob('ws-1', 'job-1', admin);
    }

    const paths = mocks.upload.mock.calls.map((call) => call[1]);
    expect(paths).toEqual([
      'external-projects/yoola/gallery/demo/uuid-a-photo.jpg',
      'external-projects/yoola/gallery/demo/uuid-b-photo.jpg',
    ]);
    for (const call of mocks.upload.mock.calls) {
      expect(call[3]).toMatchObject({ upsert: false });
      expect(Buffer.from(call[2]).toString('latin1')).not.toContain(
        'SerialABC123'
      );
    }
  });

  it('records the stored-byte hash in metadata, not in the key', async () => {
    const { processManagedAssetImportJob } =
      await import('./managed-asset-import');
    mocks.uuid.mockReturnValue('uuid-a');
    const { admin, updates } = scenario();
    await processManagedAssetImportJob('ws-1', 'job-1', admin);

    const assetUpdate = updates.find(
      (update) => update.table === 'workspace_external_project_assets'
    )?.values as { metadata: { import: { checksumSha256: string } } };
    expect(assetUpdate.metadata.import.checksumSha256).toMatch(
      /^[0-9a-f]{64}$/
    );
    expect(mocks.upload.mock.calls[0]?.[1]).not.toContain(
      assetUpdate.metadata.import.checksumSha256
    );
  });

  it('removes the new object when the asset row cannot be updated', async () => {
    const { processManagedAssetImportJob } =
      await import('./managed-asset-import');
    mocks.uuid.mockReturnValue('uuid-a');
    const { admin } = scenario({ error: { message: 'update failed' } });
    await processManagedAssetImportJob('ws-1', 'job-1', admin);

    expect(mocks.delete).toHaveBeenCalledWith(
      'ws-1',
      'external-projects/yoola/gallery/demo/uuid-a-photo.jpg'
    );
  });

  it('removes the new object when a concurrent import already claimed the asset', async () => {
    const { processManagedAssetImportJob } =
      await import('./managed-asset-import');
    mocks.uuid.mockReturnValue('uuid-late');
    const { admin } = scenario({ data: [], error: null });
    await processManagedAssetImportJob('ws-1', 'job-1', admin);

    expect(mocks.delete).toHaveBeenCalledWith(
      'ws-1',
      'external-projects/yoola/gallery/demo/uuid-late-photo.jpg'
    );
  });
});
