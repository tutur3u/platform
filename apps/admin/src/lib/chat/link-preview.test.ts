import type { Dispatcher } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchChatLinkPreviewWithDependencies,
  isPrivatePreviewIp,
  normalizeChatPreviewUrl,
  type PreviewFetch,
  resolveSafePreviewAddress,
} from './link-preview';

vi.mock('server-only', () => ({}));

function dispatcherForAddress(address: string) {
  return {
    address,
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as Dispatcher & { address: string };
}

describe('chat link preview', () => {
  it('normalizes preview URLs by dropping fragments', () => {
    expect(normalizeChatPreviewUrl('https://example.com/path?q=1#secret')).toBe(
      'https://example.com/path?q=1'
    );
  });

  it('blocks private and IPv4-mapped IPv6 addresses', async () => {
    expect(isPrivatePreviewIp('127.0.0.1')).toBe(true);
    expect(isPrivatePreviewIp('[::1]')).toBe(true);
    expect(isPrivatePreviewIp('[::ffff:7f00:1]')).toBe(true);
    expect(isPrivatePreviewIp('::ffff:169.254.169.254')).toBe(true);

    await expect(
      resolveSafePreviewAddress(new URL('http://[::ffff:7f00:1]/'))
    ).rejects.toThrow('preview_url_host_forbidden');
    await expect(
      resolveSafePreviewAddress(new URL('https://example.com/'), async () => [
        { address: '169.254.169.254', family: 4 },
      ])
    ).rejects.toThrow('preview_url_network_forbidden');
  });

  it('fetches through the checked address and revalidates redirects', async () => {
    const usedAddresses: string[] = [];
    const resolveHost = vi.fn(async (hostname: string) => {
      if (hostname === 'example.com') {
        return [{ address: '93.184.216.34', family: 4 as const }];
      }
      if (hostname === 'safe.example') {
        return [{ address: '93.184.216.35', family: 4 as const }];
      }
      throw new Error(`Unexpected host ${hostname}`);
    });
    const fetchImpl: PreviewFetch = vi.fn(async (url, init) => {
      usedAddresses.push(
        (init.dispatcher as Dispatcher & { address: string }).address
      );

      if (url.hostname === 'example.com') {
        return new Response(null, {
          headers: { location: 'https://safe.example/final#ignored' },
          status: 302,
        });
      }

      return new Response('<html><title>Safe Page</title></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });

    const preview = await fetchChatLinkPreviewWithDependencies(
      'https://example.com/start#drop',
      {
        createDispatcher: (record) => dispatcherForAddress(record.address),
        fetchImpl,
        resolveHost,
      }
    );

    expect(resolveHost).toHaveBeenCalledTimes(2);
    expect(resolveHost).toHaveBeenNthCalledWith(1, 'example.com');
    expect(resolveHost).toHaveBeenNthCalledWith(2, 'safe.example');
    expect(usedAddresses).toEqual(['93.184.216.34', '93.184.216.35']);
    expect(preview).toMatchObject({
      title: 'Safe Page',
      url: 'https://safe.example/final',
    });
  });

  it('does not expose remote preview image URLs to chat clients', async () => {
    const preview = await fetchChatLinkPreviewWithDependencies(
      'https://example.com/article',
      {
        createDispatcher: (record) => dispatcherForAddress(record.address),
        fetchImpl: vi.fn(async () => {
          return new Response(
            `<html>
              <head>
                <meta property="og:title" content="Remote Image Article">
                <meta property="og:image" content="https://tracker.example/pixel.png">
              </head>
            </html>`,
            {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            }
          );
        }),
        resolveHost: vi.fn(async () => [
          { address: '93.184.216.34', family: 4 },
        ]),
      }
    );

    expect(preview).toMatchObject({
      imageUrl: null,
      title: 'Remote Image Article',
      url: 'https://example.com/article',
    });
  });

  it('decodes exactly one layer of HTML entities', async () => {
    const preview = await fetchChatLinkPreviewWithDependencies(
      'https://example.com/article',
      {
        createDispatcher: (record) => dispatcherForAddress(record.address),
        fetchImpl: vi.fn(
          async () =>
            new Response('<html><title>&amp;lt;safe&amp;gt;</title></html>', {
              headers: { 'content-type': 'text/html; charset=utf-8' },
            })
        ),
        resolveHost: vi.fn(async () => [
          { address: '93.184.216.34', family: 4 },
        ]),
      }
    );

    expect(preview.title).toBe('&lt;safe&gt;');
  });
});
