import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiMemoryServiceClient, AiMemoryServiceHttpError } from './client';

const config = {
  apiKey: 'synthetic-test-only',
  baseUrl: 'http://memory.test/',
  enabled: true,
  failOpen: true,
  timeoutMs: 10,
};
const scope = {
  id: 'memory-a',
  containerTag: 'container-a',
  userId: 'actor-a',
  wsId: 'workspace-a',
  product: 'mira',
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('actual edit service client transport', () => {
  it('posts authenticated scoped read and update without mutating provenance', async () => {
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ memory: { id: scope.id } }), {
          status: 200,
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new AiMemoryServiceClient(config);
    await client.readEditableMemory(scope);
    const write = {
      ...scope,
      content: 'Synthetic edit',
      revision: `v1:${'a'.repeat(32)}`,
      embedding: Array.from({ length: 3072 }, () => 0.1),
    };
    await client.updateEditableMemory(write);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://memory.test/v1/memories/read',
      'http://memory.test/v1/memories/update',
    ]);
    for (const [index, payload] of [scope, write].entries()) {
      const options = fetchMock.mock.calls[index]![1];
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer synthetic-test-only');
      expect(JSON.parse(options.body)).toEqual(payload);
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
  for (const status of [404, 409, 500]) {
    it(`exposes typed HTTP ${status} without provider body`, async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(new Response('Synthetic private body', { status }))
      );
      const client = new AiMemoryServiceClient(config);
      await expect(client.readEditableMemory(scope)).rejects.toEqual(
        new AiMemoryServiceHttpError(status)
      );
    });
  }
  it('aborts a held request and clears its timer', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            signal = options.signal;
            signal!.addEventListener('abort', () =>
              reject(new DOMException('Synthetic abort', 'AbortError'))
            );
          })
      )
    );
    const client = new AiMemoryServiceClient(config);
    const rejected = expect(
      client.readEditableMemory(scope)
    ).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
