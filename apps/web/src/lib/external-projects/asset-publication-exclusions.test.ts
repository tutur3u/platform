import { describe, expect, it, vi } from 'vitest';
import {
  captureAssetProofs,
  PublicationAssetLimitError,
} from './published-assets';

const { read } = vi.hoisted(() => ({
  read: vi.fn(
    async (
      _workspace: string,
      path: string | null,
      onTooLarge?: () => void
    ) => {
      if (path?.endsWith('0.png')) onTooLarge?.();
      if (path?.endsWith('2.png'))
        return { buffer: Buffer.from('verified'), contentType: 'image/png' };
      return null;
    }
  ),
}));
vi.mock('./asset-publication-bytes', () => ({
  assetBytesDigest: (bytes: Uint8Array) => `digest-${bytes.byteLength}`,
  readExternalProjectAssetBytes: read,
}));

function capture(count: number) {
  const assets = Array.from({ length: count }, (_, i) => ({
    id: String(i),
    entry_id: 'entry',
    alt_text: i === 1 ? 'Cover image' : null,
    updated_at: '2026-11-20T09:00:00.000Z',
    storage_path: `external-projects/asset-${i}.png`,
  }));
  return captureAssetProofs({
    workspaceId: 'workspace',
    entry: {
      id: 'entry',
      published_at: '2026-11-20T10:00:00.000Z',
      updated_at: '2026-11-20T10:00:00.000Z',
      profile_data: {
        media: Object.fromEntries(assets.map(({ id }) => [id, id])),
      },
    },
    assets,
    blocks: [],
  });
}

describe('publication exclusions', () => {
  it('reports oversized and unverifiable media separately from proofs', async () => {
    const { manifest, excludedAssets } = await capture(3);
    expect(Object.keys(manifest)).toEqual(['2']);
    expect(excludedAssets).toEqual([
      { assetId: '0', label: 'asset-0.png', reason: 'tooLarge' },
      { assetId: '1', label: 'Cover image', reason: 'unavailable' },
    ]);
  });

  it('rejects entries over the asset limit before reading bytes', async () => {
    read.mockClear();
    await expect(capture(25)).rejects.toBeInstanceOf(
      PublicationAssetLimitError
    );
    expect(read).not.toHaveBeenCalled();
  });
});
