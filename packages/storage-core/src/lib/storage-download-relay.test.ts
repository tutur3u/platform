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
          new Request('https://web.example.test/file', { method: 'HEAD' }),
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

  it('supports one range conservatively and rejects multiple ranges', async () => {
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
    expect(mocks.reserve).toHaveBeenLastCalledWith(expect.any(Object), 100);
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
