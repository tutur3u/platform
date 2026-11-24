import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EpmClient } from './epm';
import { clearEpmDeliveryMemo } from './epm-delivery-memo';
import { ValidationError } from './errors';

const mockFetch = vi.fn();

const createMockResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => data,
  text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

describe('EpmClient delivery revalidation', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearEpmDeliveryMemo();
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  const payload = {
    collections: [],
    loadingData: null,
    workspaceId: 'ws_123',
  };

  const withEtag = (data: unknown, etag: string) => ({
    ...createMockResponse(data),
    headers: new Headers({
      'content-type': 'application/json',
      etag,
    }),
  });

  const notModified = () => ({
    ok: false,
    status: 304,
    statusText: 'Not Modified',
    headers: new Headers(),
    json: async () => {
      throw new Error('304 has no body');
    },
    text: async () => '',
  });

  const sentHeaders = (call: number) =>
    new Headers(mockFetch.mock.calls[call]?.[1]?.headers);

  it('sends If-None-Match and reuses the body on a 304', async () => {
    const client = new EpmClient({
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });
    mockFetch
      .mockResolvedValueOnce(withEtag(payload, 'W/"rev-1"'))
      .mockResolvedValueOnce(notModified());

    const first = await client.getDelivery('ws_123');
    const second = await client.getDelivery('ws_123');

    expect(sentHeaders(0).get('If-None-Match')).toBeNull();
    expect(sentHeaders(1).get('If-None-Match')).toBe('W/"rev-1"');
    expect(second).toEqual(first);
  });

  it('replaces the memo when the server returns a new revision', async () => {
    const client = new EpmClient({
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });
    mockFetch
      .mockResolvedValueOnce(withEtag(payload, 'W/"rev-1"'))
      .mockResolvedValueOnce(
        withEtag({ ...payload, workspaceId: 'ws_new' }, 'W/"rev-2"')
      )
      .mockResolvedValueOnce(notModified());

    await client.getDelivery('ws_123');
    const updated = await client.getDelivery('ws_123');
    const revalidated = await client.getDelivery('ws_123');

    expect(sentHeaders(2).get('If-None-Match')).toBe('W/"rev-2"');
    expect(updated.workspaceId).toBe('ws_new');
    expect(revalidated.workspaceId).toBe('ws_new');
  });

  it('keeps separate memos per workspace and base URL', async () => {
    const a = new EpmClient({
      baseUrl: 'https://a.example.com/api/v1',
      fetch: mockFetch,
    });
    const b = new EpmClient({
      baseUrl: 'https://b.example.com/api/v1',
      fetch: mockFetch,
    });
    mockFetch.mockResolvedValue(withEtag(payload, 'W/"rev-1"'));

    await a.getDelivery('ws_1');
    await a.getDelivery('ws_2');
    await b.getDelivery('ws_1');

    for (const call of [0, 1, 2]) {
      expect(sentHeaders(call).get('If-None-Match')).toBeNull();
    }
  });

  it('never reads or writes the memo for preview delivery', async () => {
    const client = new EpmClient({
      apiKey: 'key',
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });
    mockFetch.mockResolvedValue(withEtag(payload, 'W/"rev-1"'));

    await client.getDelivery('ws_123', { preview: true });
    await client.getDelivery('ws_123', { preview: true });
    await client.getDelivery('ws_123');

    for (const call of [0, 1, 2]) {
      expect(sentHeaders(call).get('If-None-Match')).toBeNull();
    }
  });

  it('reads the delivery version without conditional headers', async () => {
    const client = new EpmClient({
      baseUrl: 'https://example.com/api/v1',
      fetch: mockFetch,
    });
    mockFetch.mockResolvedValueOnce(createMockResponse({ version: 7 }));

    await expect(client.getDeliveryVersion('ws_123')).resolves.toEqual({
      version: 7,
    });
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      'https://example.com/api/v1/workspaces/ws_123/external-projects/delivery/version'
    );
    expect(sentHeaders(0).get('If-None-Match')).toBeNull();
    await expect(client.getDeliveryVersion(' ')).rejects.toThrow(
      ValidationError
    );
  });
});
