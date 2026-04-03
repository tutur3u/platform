import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from './errors';
import {
  ExternalProjectsClient,
  isYoolaExternalProjectLoadingData,
} from './external-projects';
import type { ExternalProjectDeliveryPayload } from './types';

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

const createMockResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
  text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

describe('ExternalProjectsClient', () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads public delivery payload and normalizes asset URLs', async () => {
    const payload: ExternalProjectDeliveryPayload = {
      adapter: 'yoola',
      canonicalProjectId: 'yoola-main',
      collections: [
        {
          collection_type: 'artworks',
          config: {},
          description: null,
          entries: [
            {
              assets: [
                {
                  alt_text: 'Starter Signal artwork',
                  asset_type: 'image',
                  assetUrl:
                    '/api/v1/workspaces/ws_123/external-projects/assets/asset_1',
                  block_id: null,
                  entry_id: 'entry_1',
                  id: 'asset_1',
                  metadata: {},
                  sort_order: 0,
                  source_url: null,
                  storage_path: 'external-projects/yoola/artworks/1.png',
                },
              ],
              blocks: [],
              id: 'entry_1',
              metadata: {},
              profile_data: {},
              published_at: null,
              slug: 'starter-signal',
              status: 'published',
              subtitle: null,
              summary: 'Launch frame.',
              title: 'STARTER SIGNAL',
            },
          ],
          id: 'collection_1',
          slug: 'artworks',
          title: 'Artworks',
        },
      ],
      generatedAt: '2026-04-02T00:00:00.000Z',
      loadingData: {
        adapter: 'yoola',
        artworkCategories: ['SPEED'],
        artworks: [
          {
            altText: 'Starter Signal artwork',
            assetId: 'asset_1',
            assetUrl:
              '/api/v1/workspaces/ws_123/external-projects/assets/asset_1',
            category: 'SPEED',
            entryId: 'entry_1',
            height: 2124,
            label: 'ARC-01',
            note: 'Launch frame.',
            orientation: 'portrait',
            rarity: 'SSR',
            slug: 'starter-signal',
            summary: 'Launch frame.',
            title: 'STARTER SIGNAL',
            width: 1440,
            year: '2026',
          },
        ],
        artworksByCategory: {
          SPEED: [
            {
              altText: 'Starter Signal artwork',
              assetId: 'asset_1',
              assetUrl:
                '/api/v1/workspaces/ws_123/external-projects/assets/asset_1',
              category: 'SPEED',
              entryId: 'entry_1',
              height: 2124,
              label: 'ARC-01',
              note: 'Launch frame.',
              orientation: 'portrait',
              rarity: 'SSR',
              slug: 'starter-signal',
              summary: 'Launch frame.',
              title: 'STARTER SIGNAL',
              width: 1440,
              year: '2026',
            },
          ],
        },
        featuredArtwork: {
          altText: 'Starter Signal artwork',
          assetId: 'asset_1',
          assetUrl:
            '/api/v1/workspaces/ws_123/external-projects/assets/asset_1',
          category: 'SPEED',
          entryId: 'entry_1',
          height: 2124,
          label: 'ARC-01',
          note: 'Launch frame.',
          orientation: 'portrait',
          rarity: 'SSR',
          slug: 'starter-signal',
          summary: 'Launch frame.',
          title: 'STARTER SIGNAL',
          width: 1440,
          year: '2026',
        },
        loreCapsules: [
          {
            artworkAssetUrl:
              '/api/v1/workspaces/ws_123/external-projects/assets/asset_1',
            artworkEntryId: 'entry_1',
            channel: 'Main Transmission',
            date: '2026.04.12',
            entryId: 'entry_2',
            excerptMarkdown: 'The violet glow stayed.',
            slug: 'violet-horizon',
            status: 'IN TRANSIT',
            summary: 'Post-race silence.',
            tags: ['MAIN_STORY'],
            teaser: 'A post-race scene file.',
            title: 'The Violet Horizon',
          },
        ],
        singletonSections: {},
      },
      profileData: {
        brand: 'Yoola',
      },
      workspaceId: 'ws_123',
    };

    mockFetch.mockResolvedValueOnce(createMockResponse(payload));

    const client = new ExternalProjectsClient({
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });
    const result = await client.getDelivery('ws_123');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/delivery',
      expect.objectContaining({
        method: 'GET',
      })
    );
    expect(result.collections[0]?.entries[0]?.assets[0]?.assetUrl).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/asset_1'
    );
    expect(result.loadingData?.adapter).toBe('yoola');
    if (result.loadingData?.adapter === 'yoola') {
      expect(result.loadingData.featuredArtwork?.assetUrl).toBe(
        'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/asset_1'
      );
      expect(result.loadingData.loreCapsules[0]?.artworkAssetUrl).toBe(
        'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/asset_1'
      );
    }
  });

  it('requires an API key for preview delivery', async () => {
    const client = new ExternalProjectsClient({
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    await expect(
      client.getDelivery('ws_123', { preview: true })
    ).rejects.toThrow(ValidationError);
  });

  it('returns adapter-specific loading data helpers', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        adapter: 'yoola',
        canonicalProjectId: 'yoola-main',
        collections: [],
        generatedAt: '2026-04-02T00:00:00.000Z',
        loadingData: {
          adapter: 'yoola',
          artworkCategories: ['POWER'],
          artworks: [],
          artworksByCategory: { POWER: [] },
          featuredArtwork: null,
          loreCapsules: [],
          singletonSections: {},
        },
        profileData: {},
        workspaceId: 'ws_123',
      } satisfies ExternalProjectDeliveryPayload)
    );

    const client = new ExternalProjectsClient({
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    const loadingData = await client.getYoolaLoadingData('ws_123');
    expect(isYoolaExternalProjectLoadingData(loadingData)).toBe(true);
    expect(loadingData.artworkCategories).toEqual(['POWER']);
  });

  it('sends authorization when preview delivery is requested', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        adapter: 'junly',
        canonicalProjectId: 'junly-main',
        collections: [],
        generatedAt: '2026-04-02T00:00:00.000Z',
        loadingData: {
          adapter: 'junly',
          sections: {},
        },
        profileData: {},
        workspaceId: 'ws_123',
      } satisfies ExternalProjectDeliveryPayload)
    );

    const client = new ExternalProjectsClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    await client.getDelivery('ws_123', { preview: true });

    const requestOptions = mockFetch.mock.calls[0]?.[1];
    const headers = requestOptions?.headers as Headers;

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/delivery?preview=true'
    );
    expect(headers.get('Authorization')).toBe('Bearer ttr_test_key');
  });
});
