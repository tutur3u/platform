import { describe, expect, it, vi } from 'vitest';
import { type AssetsBinding, fetchAsset } from './assets';

function binding(reply: (input: string, init: RequestInit) => Response) {
  const fetch = vi.fn(
    async (
      input: string,
      init: { method: string; headers: Record<string, string> }
    ) => reply(input, init)
  );
  const assets: AssetsBinding = { fetch };
  return { assets, fetch };
}

describe('portable assets binding', () => {
  it('passes the URL, method and headers and streams the reply back', async () => {
    const { assets, fetch } = binding(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('chunk-1 '));
              controller.enqueue(new TextEncoder().encode('chunk-2'));
              controller.close();
            },
          }),
          {
            status: 206,
            statusText: 'Partial Content',
            headers: { 'content-type': 'text/javascript', etag: '"v1"' },
          }
        )
    );
    const response = await fetchAsset(
      assets,
      new Request('https://tuturuuu.com/assets/app.js', {
        headers: { range: 'bytes=0-9', 'if-none-match': '"v0"' },
      })
    );
    expect(fetch).toHaveBeenCalledWith('https://tuturuuu.com/assets/app.js', {
      method: 'GET',
      headers: { range: 'bytes=0-9', 'if-none-match': '"v0"' },
    });
    expect(response.status).toBe(206);
    expect(response.statusText).toBe('Partial Content');
    expect(response.headers.get('etag')).toBe('"v1"');
    expect(await response.text()).toBe('chunk-1 chunk-2');
  });

  it('returns no body for HEAD and null-body statuses', async () => {
    const head = binding(() => new Response(null, { status: 200 }));
    const headResponse = await fetchAsset(
      head.assets,
      new Request('https://x.test/robots.txt', { method: 'HEAD' })
    );
    expect(head.fetch.mock.calls[0]?.[1].method).toBe('HEAD');
    expect(headResponse.body).toBeNull();

    const cancel = vi.fn(async () => {});
    const notModified: AssetsBinding = {
      fetch: async () => ({
        status: 304,
        statusText: 'Not Modified',
        headers: new Headers({ etag: '"v1"' }),
        body: {
          getReader: () => ({
            read: async () => ({ done: true }),
            cancel,
          }),
        },
      }),
    };
    const response = await fetchAsset(
      notModified,
      new Request('https://x.test/assets/app.js')
    );
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.get('etag')).toBe('"v1"');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels the upstream reader when the consumer cancels', async () => {
    const cancel = vi.fn(async () => {});
    const assets: AssetsBinding = {
      fetch: async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: async () => ({ done: false, value: new Uint8Array([1]) }),
            cancel,
          }),
        },
      }),
    };
    const response = await fetchAsset(assets, new Request('https://x.test/a'));
    await response.body?.cancel('stop');
    expect(cancel).toHaveBeenCalledWith('stop');
  });
});
