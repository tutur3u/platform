import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EpmClient } from './epm';
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
});
