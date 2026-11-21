import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));

import { cacheLife } from 'next/cache';
import { DESKTOP_PACKAGES, type DesktopPlatform } from './desktop-downloads';
import { getDesktopRelease } from './desktop-downloads.server';

const api = 'https://api.github.com/repos/tutur3u/platform/releases';
const base = 'https://github.com/tutur3u/platform/releases';
const tag = 'desktop-v0.27.28-1000001';
const previousTag = 'desktop-v0.27.27-1000000';

function release(releaseTag: string, platforms: DesktopPlatform[]) {
  return {
    tag_name: releaseTag,
    draft: false,
    prerelease: true,
    html_url: `${base}/tag/${releaseTag}`,
    assets: platforms.map((platform) => {
      const { name } = DESKTOP_PACKAGES[platform];
      return {
        name,
        state: 'uploaded',
        browser_download_url: `${base}/download/${releaseTag}/${name}`,
        digest: `sha256:${'a'.repeat(64)}`,
        size: 12345,
      };
    }),
  };
}

function stubFetch(responses: Record<string, unknown>) {
  const fetch = vi.fn(async (url: string, _init: RequestInit) =>
    url in responses
      ? Response.json(responses[url])
      : new Response(null, { status: 503 })
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GitHub desktop release lookup', () => {
  it('prefers the newest published assets to a stale status pointer', async () => {
    const url = `${api}?per_page=100`;
    const fetch = stubFetch({
      [url]: [
        release(tag, ['macos', 'windows', 'linux']),
        release(previousTag, ['macos', 'windows', 'linux']),
      ],
    });

    const result = await getDesktopRelease('0.27.27', 1000000);

    expect(result?.downloads.map((download) => download.tag)).toEqual([
      tag,
      tag,
      tag,
    ]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      url,
      expect.objectContaining({
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Tuturuuu-Desktop-Downloads',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'manual',
      })
    );
    expect(cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ revalidate: 300 })
    );
  });

  it('fills missing platforms by tag without replacing a newer listed asset', async () => {
    const fetch = stubFetch({
      [`${api}?per_page=100`]: [release(tag, ['macos'])],
      [`${api}/tags/${previousTag}`]: release(previousTag, ['macos', 'linux']),
    });

    const { downloads } = (await getDesktopRelease('0.27.27', 1000000)) ?? {};
    expect(downloads?.map(({ platform, tag }) => [platform, tag])).toEqual([
      ['macos', tag],
      ['linux', previousTag],
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1].signal).toBe(
      fetch.mock.calls[1]?.[1].signal
    );
    expect(cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ revalidate: 300 })
    );
  });

  it('checks history without a valid pointer and exposes no download on failure', async () => {
    const fetch = stubFetch({});
    expect(await getDesktopRelease('../releases', 1000001)).toBeNull();
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${api}?per_page=100`,
      expect.any(Object)
    );
    expect(cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ revalidate: 300 })
    );
  });

  it('uses the exact public prerelease when the catalog lookup fails', async () => {
    stubFetch({
      [`${api}/tags/${tag}`]: release(tag, ['macos', 'windows', 'linux']),
    });

    expect(
      (await getDesktopRelease('0.27.28', 1000001))?.downloads
    ).toHaveLength(3);
  });

  it('ignores an unexpected tag on the exact endpoint', async () => {
    stubFetch({
      [`${api}/tags/${tag}`]: release(previousTag, [
        'macos',
        'windows',
        'linux',
      ]),
    });

    expect(await getDesktopRelease('0.27.28', 1000001)).toBeNull();
  });
});
