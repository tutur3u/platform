import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpmClient } from './epm';
import { linkExternalProjectPublicFolderAssets } from './external-projects-public-assets';
import { uploadExternalProjectPublicFolderAssets } from './external-projects-public-assets-node';
import type { ExternalProjectSyncManifest } from './types';

const mockFetch = vi.fn();

const createMockResponse = (data: unknown, status = 200) => ({
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

function createManifest(): ExternalProjectSyncManifest {
  return {
    adapter: 'yoola',
    content: {
      entries: [
        {
          assets: [
            {
              assetType: 'image',
              metadata: {
                caption: 'Starter Signal',
              },
              sourceUrl: '/artworks/starter-signal.png',
              stableSourceId: 'yoola:art:starter-signal:image',
            },
          ],
          collectionSlug: 'artworks',
          slug: 'starter-signal',
          stableSourceId: 'yoola:art:starter-signal',
          title: 'Starter Signal',
        },
      ],
    },
    schema: {
      collections: [],
    },
    version: 1,
  };
}

describe('external project public folder assets', () => {
  afterEach(() => {
    mockFetch.mockReset();
  });

  it('links manifest public paths to deterministic external project storage paths', () => {
    const manifest = createManifest();

    const linked = linkExternalProjectPublicFolderAssets(manifest);
    const originalAsset = manifest.content.entries[0]?.assets?.[0];
    const linkedAsset = linked.content.entries[0]?.assets?.[0];

    expect(originalAsset?.sourceUrl).toBe('/artworks/starter-signal.png');
    expect(originalAsset?.storagePath).toBeUndefined();
    expect(linkedAsset?.sourceUrl).toBeNull();
    expect(linkedAsset?.metadata?.publicPath).toBe(
      '/artworks/starter-signal.png'
    );
    expect(linkedAsset?.storagePath).toBe(
      'external-projects/yoola/artworks/starter-signal/starter-signal.png'
    );
  });

  it('uploads linked public assets through the Tuturuuu app server', async () => {
    const publicDir = await mkdtemp(join(tmpdir(), 'ttr-public-assets-'));
    await mkdir(join(publicDir, 'artworks'));
    await writeFile(
      join(publicDir, 'artworks', 'starter-signal.png'),
      'png bytes'
    );

    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        data: {
          fullPath:
            'ws_123/external-projects/yoola/artworks/starter-signal/starter-signal.png',
          path: 'external-projects/yoola/artworks/starter-signal/starter-signal.png',
        },
      })
    );

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    try {
      const result = await uploadExternalProjectPublicFolderAssets(
        client,
        'ws_123',
        createManifest(),
        { fetch: mockFetch, publicDir }
      );

      expect(result.skipped).toEqual([]);
      expect(result.uploaded).toEqual([
        {
          collectionSlug: 'artworks',
          entrySlug: 'starter-signal',
          filename: 'starter-signal.png',
          publicPath: '/artworks/starter-signal.png',
          stableSourceId: 'yoola:art:starter-signal:image',
          storagePath:
            'external-projects/yoola/artworks/starter-signal/starter-signal.png',
        },
      ]);

      expect(mockFetch.mock.calls[0]?.[0]).toBe(
        'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/upload-url'
      );
      const uploadBody = mockFetch.mock.calls[0]?.[1]?.body as FormData;
      expect(uploadBody.get('collectionType')).toBe('artworks');
      expect(uploadBody.get('entrySlug')).toBe('starter-signal');
      expect(uploadBody.get('upsert')).toBe('true');
      expect(uploadBody.get('file')).toBeInstanceOf(File);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.manifest.content.entries[0]?.assets?.[0]?.storagePath).toBe(
        'external-projects/yoola/artworks/starter-signal/starter-signal.png'
      );
    } finally {
      await rm(publicDir, { force: true, recursive: true });
    }
  });

  it('uploads common audio assets with audio content types', async () => {
    const publicDir = await mkdtemp(join(tmpdir(), 'ttr-public-audio-'));
    await mkdir(join(publicDir, 'audio'));
    await writeFile(join(publicDir, 'audio', 'voice-reel.wav'), 'wav bytes');

    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        data: {
          fullPath:
            'ws_123/external-projects/kendra/voice-reels/demo/voice-reel.wav',
          path: 'external-projects/kendra/voice-reels/demo/voice-reel.wav',
        },
      })
    );

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });
    const manifest: ExternalProjectSyncManifest = {
      adapter: 'kendra' as never,
      content: {
        entries: [
          {
            assets: [
              {
                assetType: 'audio',
                sourceUrl: '/audio/voice-reel.wav',
                stableSourceId: 'kendra:voice-reel:demo:audio',
              },
            ],
            collectionSlug: 'voice-reels',
            slug: 'demo',
            stableSourceId: 'kendra:voice-reel:demo',
            title: 'Demo Reel',
          },
        ],
      },
      schema: {
        collections: [],
      },
      version: 1,
    };

    try {
      await uploadExternalProjectPublicFolderAssets(
        client,
        'ws_123',
        manifest,
        {
          fetch: mockFetch,
          publicDir,
        }
      );

      const uploadBody = mockFetch.mock.calls[0]?.[1]?.body as FormData;
      const file = uploadBody.get('file') as File;
      expect(file.type).toBe('audio/wav');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      await rm(publicDir, { force: true, recursive: true });
    }
  });
});
