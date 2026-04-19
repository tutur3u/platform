import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEpmNavigationItems,
  EpmClient,
  getEpmCollectionNavigationTitle,
} from './epm';
import { ValidationError } from './errors';

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

describe('EpmClient', () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requires an API key for management calls', async () => {
    const client = new EpmClient({
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    await expect(client.getSummary('ws_123')).rejects.toThrow(ValidationError);
  });

  it('loads workspace summary with bearer auth', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        adapter: 'yoola',
        canonicalProjectId: 'project-1',
        collections: [],
        counts: {
          archived: 1,
          collections: 2,
          drafts: 3,
          entries: 9,
          published: 4,
          scheduled: 1,
        },
        queues: {
          archivedBacklog: [],
          draftsMissingMedia: [],
          recentlyImportedUnpublished: [],
          scheduledSoon: [],
        },
        recentActivity: {
          importJobs: [],
          publishEvents: [],
        },
        workspaceId: 'ws_123',
      })
    );

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    const summary = await client.getSummary('ws_123');
    const requestOptions = mockFetch.mock.calls[0]?.[1];
    const headers = requestOptions?.headers as Headers;

    expect(summary.counts.entries).toBe(9);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/summary'
    );
    expect(headers.get('Authorization')).toBe('Bearer ttr_test_key');
  });

  it('sends collection filter when listing entries', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse([]));

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    await client.listEntries('ws_123', { collectionId: 'collection_1' });

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/entries?collectionId=collection_1'
    );
  });

  it('normalizes relative asset URLs when loading studio data', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse({
        assets: [
          {
            asset_type: 'image',
            asset_url:
              '/api/v1/workspaces/ws_123/external-projects/assets/asset_1',
            entry_id: 'entry_1',
            id: 'asset_1',
            metadata: {},
            preview_url:
              '/api/v1/workspaces/ws_123/external-projects/assets/asset_1?width=1600',
            sort_order: 0,
          },
        ],
        binding: {
          adapter: 'yoola',
          canonical_id: 'project-1',
          canonical_project: null,
          enabled: true,
        },
        blocks: [],
        collections: [],
        entries: [],
        importJobs: [],
        loadingData: null,
        publishEvents: [],
      })
    );

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    const studio = await client.getStudio('ws_123');

    expect(studio.assets[0]?.asset_url).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/asset_1'
    );
    expect(studio.assets[0]?.preview_url).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/asset_1?width=1600'
    );
  });

  it('posts bulk workflow payloads', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse([]));

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    await client.bulkUpdateEntries('ws_123', {
      action: 'schedule',
      entryIds: ['entry_1', 'entry_2'],
      scheduledFor: '2026-04-20T09:00:00.000Z',
    });

    const requestOptions = mockFetch.mock.calls[0]?.[1];
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/entries/bulk'
    );
    expect(requestOptions?.method).toBe('POST');
    expect(requestOptions?.body).toBe(
      JSON.stringify({
        action: 'schedule',
        entryIds: ['entry_1', 'entry_2'],
        scheduledFor: '2026-04-20T09:00:00.000Z',
      })
    );
  });

  it('supports delete management calls for collections, entries, and assets', async () => {
    mockFetch
      .mockResolvedValueOnce(createMockResponse({ ok: true }))
      .mockResolvedValueOnce(createMockResponse({ ok: true }))
      .mockResolvedValueOnce(createMockResponse({ ok: true }));

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    await client.deleteCollection('ws_123', 'collection_1');
    await client.deleteEntry('ws_123', 'entry_1');
    await client.deleteAsset('ws_123', 'asset_1');

    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/collections/collection_1'
    );
    expect(mockFetch.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(mockFetch.mock.calls[1]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/entries/entry_1'
    );
    expect(mockFetch.mock.calls[1]?.[1]?.method).toBe('DELETE');
    expect(mockFetch.mock.calls[2]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/asset_1'
    );
    expect(mockFetch.mock.calls[2]?.[1]?.method).toBe('DELETE');
  });

  it('uploads asset files through signed upload URLs', async () => {
    mockFetch
      .mockResolvedValueOnce(
        createMockResponse({
          fullPath: 'ws_123/external-projects/yoola/artworks/entry/file.png',
          path: 'external-projects/yoola/artworks/entry/file.png',
          signedUrl: 'https://upload.example.com/object',
          token: 'upload_token',
        })
      )
      .mockResolvedValueOnce(createMockResponse('', 200));

    const client = new EpmClient({
      apiKey: 'ttr_test_key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });

    const file = new File(['hello'], 'file.png', { type: 'image/png' });
    const result = await client.uploadAssetFile('ws_123', file, {
      collectionType: 'artworks',
      entrySlug: 'entry',
    });

    expect(result.path).toBe('external-projects/yoola/artworks/entry/file.png');
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/assets/upload-url'
    );
    expect(mockFetch.mock.calls[1]?.[0]).toBe(
      'https://upload.example.com/object'
    );
  });

  it('builds navigation items from collection config for external apps like yoola', () => {
    const collections = [
      {
        config: {
          navigation: {
            href: '/gallery',
            title: 'Archive',
          },
        },
        id: 'collection_1',
        is_enabled: true,
        slug: 'artworks',
        title: 'Artworks',
      },
      {
        config: {
          navigation: {
            title: 'Lore',
            visible: false,
          },
        },
        id: 'collection_2',
        is_enabled: true,
        slug: 'writing',
        title: 'Writing',
      },
    ] as any;

    expect(getEpmCollectionNavigationTitle(collections[0])).toBe('Archive');
    expect(buildEpmNavigationItems(collections)).toEqual([
      {
        collectionId: 'collection_1',
        href: '/gallery',
        navigation: {
          href: '/gallery',
          title: 'Archive',
        },
        slug: 'artworks',
        title: 'Archive',
        visible: true,
      },
    ]);
  });
});
