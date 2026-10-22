import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchZaloPersonalAttachment } from './zalo-personal-attachment';

const url = 'https://media.example.test/message-selected';
const userAgent = 'attachment-test-agent';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchZaloPersonalAttachment', () => {
  it('sends only the user agent and preserves the 30-second deadline', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const result = await fetchZaloPersonalAttachment({ url, userAgent });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('expected_fetch');
    expect(call[0]).toBe(url);
    const headers = new Headers(call[1]?.headers);
    expect([...headers.keys()]).toEqual(['user-agent']);
    expect(headers.has('cookie')).toBe(false);
    expect(headers.get('user-agent')).toBe(userAgent);
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(Buffer.isBuffer(result)).toBe(true);
    expect([...result]).toEqual([1, 2, 3]);
  });

  it('retains response-status rejection without reading the body', async () => {
    const response = new Response(null, { status: 403 });
    const getReader = vi.fn();
    vi.spyOn(response, 'body', 'get').mockImplementation(getReader);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
    await expect(
      fetchZaloPersonalAttachment({ url, userAgent })
    ).rejects.toThrow('zalo_personal_media_fetch_failed_403');
    expect(getReader).not.toHaveBeenCalled();
  });

  it.each([undefined, '1'])(
    'rejects actual bytes above 25 MiB before creating a Buffer (%s)',
    async (header) => {
      const cancel = vi.fn();
      let reads = 0;
      const pull = vi.fn(
        (controller: ReadableStreamDefaultController<Uint8Array>) => {
          if (reads++ === 0)
            controller.enqueue(new Uint8Array(25 * 1024 * 1024 + 1));
          else controller.close();
        }
      );
      const body = new ReadableStream<Uint8Array>(
        { pull, cancel },
        { highWaterMark: 0 }
      );
      const headers = new Headers();
      if (header !== undefined) headers.set('content-length', header);
      const response = new Response(body, { headers });
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(response));
      const from = vi.spyOn(Buffer, 'from');
      await expect(
        fetchZaloPersonalAttachment({ url, userAgent })
      ).rejects.toThrow();
      expect(from).not.toHaveBeenCalled();
      expect(pull).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(body.locked).toBe(false);
    }
  );

  it('preserves a successful empty response as an empty Buffer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null))
    );
    const result = await fetchZaloPersonalAttachment({ url, userAgent });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.byteLength).toBe(0);
  });
});
