import { EXOCORPSE_WORKSPACE_ID } from '@tuturuuu/internal-api/lettin';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from './context';
import { prepareImportMedia } from './import-media';
import { buildImportPlan } from './import-plan';

const source = vi.hoisted(() => ({
  asset: vi.fn(),
  provider: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/lettin-server', () => ({
  readExocorpseAssetPath: source.asset,
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  resolveWorkspaceStorageProvider: source.provider,
  downloadWorkspaceStorageObjectForProvider: source.download,
}));
const actor = { id: 'synthetic-owner', wsId: 'synthetic-workspace' } as Actor;
const managedUrl = (id: string) =>
  `https://tuturuuu.com/api/v1/workspaces/${EXOCORPSE_WORKSPACE_ID}/external-projects/assets/${id}`;
const first = '00000000-0000-4000-8000-000000007001';
const second = '00000000-0000-4000-8000-000000007002';
const makePlan = (urls: string[]) =>
  buildImportPlan(
    {
      entries: urls.map((url, index) => ({
        stableSourceId: `synthetic-${index}`,
        collectionSlug: 'characters',
        title: `Synthetic ${index}`,
        assets: [{ assetType: 'image', sourceUrl: url }],
      })),
    },
    'Synthetic import'
  );
function bucket() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  source.asset.mockResolvedValue({
    storage_path: 'external-projects/exocorpse/synthetic.png',
    metadata: { provider: 'supabase' },
  });
  source.provider.mockResolvedValue({ provider: 'r2', misconfigured: false });
  source.download.mockResolvedValue({
    buffer: new Uint8Array([1, 2, 3]),
    contentType: 'image/png',
  });
});
describe('Managed Exocorpse artwork copies', () => {
  it('copies repeated assets once into private target storage and leaves the source untouched', async () => {
    const target = bucket();
    const original = makePlan([managedUrl(first), managedUrl(first)]);
    const result = await prepareImportMedia(
      target as unknown as R2Bucket,
      actor,
      'synthetic-world',
      original
    );
    expect(target.put).toHaveBeenCalledTimes(1);
    expect(source.download).toHaveBeenCalledWith(
      EXOCORPSE_WORKSPACE_ID,
      'supabase',
      'external-projects/exocorpse/synthetic.png'
    );
    expect(result.plan.entries[0]?.draft.image).toMatch(
      /^\/api\/v1\/lettin\/media\//
    );
    expect(result.plan.entries[1]?.draft.image).toEqual(
      result.plan.entries[0]?.draft.image
    );
    expect(original.entries[0]?.draft.image).toBe(managedUrl(first));
    expect(target.put.mock.calls[0]?.[2]).toMatchObject({
      httpMetadata: { cacheControl: 'private, no-store' },
    });
    await result.cleanup();
    expect(target.delete).toHaveBeenCalledWith(result.media[0]?.path);
  });
  it('does not fetch arbitrary external artwork or another workspace', async () => {
    const target = bucket();
    const result = await prepareImportMedia(
      target as unknown as R2Bucket,
      actor,
      'synthetic-world',
      makePlan([
        'https://example.test/image.png',
        managedUrl(first).replace(EXOCORPSE_WORKSPACE_ID, second),
      ])
    );
    expect(source.download).not.toHaveBeenCalled();
    expect(result.media).toEqual([]);
  });
  it('cleans earlier copies when a later image has an unsupported type', async () => {
    const target = bucket();
    source.download
      .mockResolvedValueOnce({
        buffer: new Uint8Array([1]),
        contentType: 'image/png',
      })
      .mockResolvedValue({
        buffer: new Uint8Array([1]),
        contentType: 'image/svg+xml',
      });
    await expect(
      prepareImportMedia(
        target as unknown as R2Bucket,
        actor,
        'synthetic-world',
        makePlan([managedUrl(first), managedUrl(second)])
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(target.put).toHaveBeenCalledTimes(1);
    expect(target.delete).toHaveBeenCalledTimes(1);
  });
  it('rejects unavailable source storage without creating target blobs', async () => {
    const target = bucket();
    source.provider.mockResolvedValue({ provider: 'r2', misconfigured: true });
    await expect(
      prepareImportMedia(
        target as unknown as R2Bucket,
        actor,
        'synthetic-world',
        makePlan([managedUrl(first)])
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(target.put).not.toHaveBeenCalled();
  });
});
