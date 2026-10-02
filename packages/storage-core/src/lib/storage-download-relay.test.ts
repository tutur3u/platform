import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reserve: vi.fn(), fetch: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./storage-download-budget', () => ({
  reserveStorageDownloadBudget: mocks.reserve,
}));

import { relayStorageDownload } from './storage-download-relay';
import {
  createStorageDownloadUrl,
  StorageDownloadError,
} from './storage-download-token';

const upstream =
  'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/file.zip?token=private-cdn-credential';
let token: string;

describe('download relay protects every file transfer', () => {
  beforeEach(() => {
    vi.stubEnv('STORAGE_DOWNLOAD_SIGNING_SECRET', 'synthetic-test-secret');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
    vi.stubEnv('WEB_APP_URL', 'https://web.example.test');
    vi.stubEnv('STORAGE_DOWNLOAD_REVOKED_BEFORE', '0');
    token = createStorageDownloadUrl(upstream, 'ws-1', 60)
      .split('/')
      .pop() as string;
    mocks.reserve.mockReset().mockResolvedValue(undefined);
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function head(length = '4') {
    return new Response(null, {
      headers: { 'Content-Length': length, 'Content-Type': 'application/zip' },
    });
  }

  it('reserves before GET and streams bytes without leaking redirect/cookie headers', async () => {
    mocks.fetch
      .mockResolvedValueOnce(head())
      .mockImplementationOnce(async () => {
        expect(mocks.reserve).toHaveBeenLastCalledWith(
          expect.objectContaining({ wsId: 'ws-1' }),
          4
        );
        return new Response('data', {
          headers: {
            'Content-Length': '4',
            'Content-Type': 'application/zip',
            Location: upstream,
            'Set-Cookie': 'secret=hidden',
            'Cache-Control': 'public',
          },
        });
      });
    const response = await relayStorageDownload(
      new Request('https://web.example.test/file'),
      token
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('data');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-security-policy')).toContain(
      'sandbox'
    );
    expect(mocks.fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'HEAD',
      redirect: 'error',
    });
  });

  it('never fetches bulk bytes after exhaustion or an unavailable limiter', async () => {
    mocks.fetch.mockResolvedValueOnce(head());
    mocks.reserve
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new StorageDownloadError('Limit exceeded', 429, 60)
      );
    const response = await relayStorageDownload(
      new Request('https://web.example.test/file'),
      token
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(mocks.fetch).toHaveBeenCalledOnce();
    mocks.fetch.mockClear();
    mocks.reserve.mockRejectedValue(
      new StorageDownloadError('Unavailable', 503)
    );
    expect(
      (
        await relayStorageDownload(
          new Request('https://web.example.test/file'),
          token
        )
      ).status
    ).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('handles HEAD without fetching a body and rejects unknown sizes', async () => {
    mocks.fetch.mockResolvedValueOnce(head());
    expect(
      (
        await relayStorageDownload(
          new Request('https://web.example.test/file', {
            method: 'HEAD',
            headers: { Range: 'bytes=invalid' },
          }),
          token
        )
      ).status
    ).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    mocks.fetch.mockResolvedValueOnce(new Response(null));
    expect(
      (
        await relayStorageDownload(
          new Request('https://web.example.test/file'),
          token
        )
      ).status
    ).toBe(502);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('reserves the exact span of one range and rejects multiple ranges', async () => {
    mocks.fetch.mockResolvedValueOnce(head('100')).mockResolvedValueOnce(
      new Response('ab', {
        status: 206,
        headers: { 'Content-Length': '2', 'Content-Range': 'bytes 0-1/100' },
      })
    );
    const response = await relayStorageDownload(
      new Request('https://web.example.test/file', {
        headers: { Range: 'bytes=0-1' },
      }),
      token
    );
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('ab');
    expect(mocks.reserve).toHaveBeenLastCalledWith(expect.any(Object), 2);
    expect(mocks.fetch.mock.calls[1]?.[1].headers.Range).toBe('bytes=0-1');
    mocks.fetch.mockClear();
    expect(
      (
        await relayStorageDownload(
          new Request('https://web.example.test/file', {
            headers: { Range: 'bytes=0-1,3-4' },
          }),
          token
        )
      ).status
    ).toBe(416);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('normalizes suffix ranges and rejects unsatisfiable ranges without a GET', async () => {
    mocks.fetch.mockResolvedValueOnce(head('100')).mockResolvedValueOnce(
      new Response('ab', {
        status: 206,
        headers: { 'Content-Length': '2', 'Content-Range': 'bytes 98-99/100' },
      })
    );
    const response = await relayStorageDownload(
      new Request('https://web.example.test/file', {
        headers: { Range: 'bytes=-2' },
      }),
      token
    );
    expect(await response.text()).toBe('ab');
    expect(mocks.fetch.mock.calls[1]?.[1].headers.Range).toBe('bytes=98-99');
    mocks.fetch.mockClear().mockResolvedValueOnce(head('100'));
    const invalid = await relayStorageDownload(
      new Request('https://web.example.test/file', {
        headers: { Range: 'bytes=100-' },
      }),
      token
    );
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get('content-range')).toBe('bytes */100');
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it('preserves upstream 416 and refuses ignored or mismatched ranges', async () => {
    for (const upstreamResponse of [
      new Response(null, { status: 416 }),
      new Response('data', { headers: { 'Content-Length': '4' } }),
      new Response('ab', {
        status: 206,
        headers: { 'Content-Length': '2', 'Content-Range': 'bytes 2-3/100' },
      }),
    ]) {
      mocks.fetch
        .mockResolvedValueOnce(head('100'))
        .mockResolvedValueOnce(upstreamResponse);
      const response = await relayStorageDownload(
        new Request('https://web.example.test/file', {
          headers: { Range: 'bytes=0-1' },
        }),
        token
      );
      expect(response.status).toBe(upstreamResponse.status === 416 ? 416 : 502);
      if (response.status === 416)
        expect(response.headers.get('content-range')).toBe('bytes */100');
      expect(mocks.fetch.mock.calls.at(-1)?.[1].signal.aborted).toBe(true);
    }
  });

  it('keeps progressing streams alive beyond two minutes using an idle deadline', async () => {
    vi.useFakeTimers();
    let upstreamController: ReadableStreamDefaultController<Uint8Array>;
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        upstreamController = controller;
      },
    });
    mocks.fetch
      .mockResolvedValueOnce(head())
      .mockResolvedValueOnce(
        new Response(upstreamBody, { headers: { 'Content-Length': '4' } })
      );
    try {
      const response = await relayStorageDownload(
        new Request('https://web.example.test/file'),
        token
      );
      const reader = response.body!.getReader();
      for (let i = 0; i < 4; i++) {
        const read = reader.read();
        await vi.advanceTimersByTimeAsync(60_000);
        upstreamController!.enqueue(new Uint8Array([65]));
        expect((await read).value).toEqual(new Uint8Array([65]));
        expect(mocks.fetch.mock.calls.at(-1)?.[1].signal.aborted).toBe(false);
      }
      upstreamController!.close();
      await reader.read();
    } finally {
      vi.useRealTimers();
    }
  });

  it('aborts changed objects and lying upstream streams', async () => {
    mocks.fetch
      .mockResolvedValueOnce(head())
      .mockResolvedValueOnce(
        new Response('oversize', { headers: { 'Content-Length': '8' } })
      );
    expect(
      (
        await relayStorageDownload(
          new Request('https://web.example.test/file'),
          token
        )
      ).status
    ).toBe(502);
    expect(mocks.fetch.mock.calls[1]?.[1].signal.aborted).toBe(true);
    mocks.fetch
      .mockResolvedValueOnce(head())
      .mockResolvedValueOnce(
        new Response('oversize', { headers: { 'Content-Length': '4' } })
      );
    const response = await relayStorageDownload(
      new Request('https://web.example.test/file'),
      token
    );
    await expect(response.text()).rejects.toThrow(
      'Storage download interrupted'
    );
  });

  it('rejects invalid tickets before any upstream request', async () => {
    expect(
      (
        await relayStorageDownload(
          new Request('https://web.example.test/file'),
          'tampered'
        )
      ).status
    ).toBe(401);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

it.each([
  'bytes=0-999999999999999999999999',
  'bytes=-999999999999999999999999',
])(
  'clamps oversized range endpoints to the inspected object: %s',
  async (range) => {
    const { resolveStorageDownloadRange } = await import(
      './storage-download-range'
    );
    expect(resolveStorageDownloadRange(range, 100)).toEqual({
      header: 'bytes=0-99',
      contentRange: 'bytes 0-99/100',
      bytes: 100,
    });
  }
);
