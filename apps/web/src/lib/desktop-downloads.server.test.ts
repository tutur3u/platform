import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));

import { cacheLife } from 'next/cache';
import { parseReleaseStatus } from './app-release-status';
import { DESKTOP_PACKAGES, type DesktopPlatform } from './desktop-downloads';
import { getDesktopRelease } from './desktop-downloads.server';

const api = 'https://api.github.com/repos/tutur3u/platform/releases';
const base = 'https://github.com/tutur3u/platform/releases';
const tag = 'desktop-v0.27.29-1000002';
const previousTag = 'desktop-v0.27.28-1000001';

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
  const fetch = vi.fn(async (url: string, _init: RequestInit) => {
    const value = responses[url];
    if (value instanceof Response) return value;
    return value === undefined
      ? new Response(null, { status: 503 })
      : Response.json(value);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function assetsListing(releaseTag: string, platforms: DesktopPlatform[]) {
  const rows = platforms.map((platform) => {
    const { name } = DESKTOP_PACKAGES[platform];
    const path = `/tutur3u/platform/releases/download/${releaseTag}/${name}`;
    return `<li><a href="${path}">${name}</a><clipboard-copy
      aria-label="Copy to clipboard digest for ${name}"
      value="sha256:${'a'.repeat(64)}"></clipboard-copy></li>`;
  });
  return new Response(`<ul>${rows.join('')}</ul>`, {
    headers: { 'content-type': 'text/html' },
  });
}

function releaseFeed(...tags: string[]) {
  return new Response(
    `<feed>${tags
      .map(
        (tag) =>
          `<entry><link rel="alternate" href="${base}/tag/${tag}"/></entry>`
      )
      .join('')}</feed>`
  );
}

function stubEdgeCache() {
  let stored: Response | undefined;
  const cache = {
    match: vi.fn(async () => stored?.clone()),
    put: vi.fn(async (_key: string, response: Response) => {
      stored = response.clone();
    }),
    delete: vi.fn(async () => {
      stored = undefined;
      return true;
    }),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  return cache;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(cacheLife).mockClear();
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

    const result = await getDesktopRelease('0.27.28', 1000001);

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
      [`${base}/expanded_assets/${previousTag}`]: assetsListing(previousTag, [
        'macos',
        'linux',
      ]),
    });

    const { downloads } = (await getDesktopRelease('0.27.28', 1000001)) ?? {};
    expect(downloads?.map(({ platform, tag }) => [platform, tag])).toEqual([
      ['macos', tag],
      ['linux', previousTag],
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
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

  it.each([403, 429, 503])(
    'recovers the cold-cache release when REST returns %i',
    async (status) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fallback = `${base}/expanded_assets/${tag}`;
      const fetch = stubFetch({
        [`${api}?per_page=100`]: new Response('untrusted response body', {
          status,
        }),
        [fallback]: assetsListing(tag, ['macos', 'windows', 'linux']),
      });

      const downloads = (await getDesktopRelease('0.27.29', 1000002))
        ?.downloads;
      expect(downloads).toHaveLength(3);
      expect(downloads?.[0]).toMatchObject({
        tag,
        sha256: 'a'.repeat(64),
        size: null,
      });
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        `${api}?per_page=100`,
        fallback,
      ]);
      expect(warn.mock.calls).toEqual([
        ['Desktop beta GitHub API lookup failed', { status }],
      ]);
    }
  );

  it('ignores a listing for an unexpected tag', async () => {
    stubFetch({
      [`${base}/expanded_assets/${tag}`]: assetsListing(previousTag, [
        'macos',
        'windows',
        'linux',
      ]),
    });

    expect(await getDesktopRelease('0.27.29', 1000002)).toBeNull();
  });

  it('uses the verified 0.27.29 manifest without making a REST request', async () => {
    const fetch = stubFetch({ [`${base}.atom`]: releaseFeed(tag) });
    const status = parseReleaseStatus('desktop', {
      schema: 1,
      platform: 'desktop',
      channel: 'beta',
      store: 'github-release',
      version: '0.27.29',
      build: 1000002,
      desktopRelease: release(tag, ['macos', 'windows', 'linux']),
    });
    const result = await getDesktopRelease(
      '0.27.29',
      1000002,
      status?.desktopRelease
    );
    expect(result?.downloads.map((download) => download.tag)).toEqual([
      tag,
      tag,
      tag,
    ]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`${base}.atom`]);
  });

  it('discovers 0.27.29 when the manifest pointer still says 0.27.28', async () => {
    const fetch = stubFetch({
      [`${base}.atom`]: releaseFeed(tag, previousTag),
      [`${base}/expanded_assets/${tag}`]: assetsListing(tag, [
        'macos',
        'linux',
        'windows',
      ]),
    });
    const older = parseReleaseStatus('desktop', {
      schema: 1,
      platform: 'desktop',
      channel: 'beta',
      store: 'github-release',
      version: '0.27.28',
      build: 1000001,
      desktopRelease: release(previousTag, ['macos', 'linux', 'windows']),
    });
    expect(
      (
        await getDesktopRelease('0.27.28', 1000001, older?.desktopRelease)
      )?.downloads.map((item) => item.tag)
    ).toEqual([tag, tag, tag]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${base}.atom`,
      `${base}/expanded_assets/${tag}`,
    ]);
  });

  it('fills a partial shard manifest from the live tag and earlier packages', async () => {
    const fetch = stubFetch({
      [`${base}.atom`]: releaseFeed(tag, previousTag),
      [`${base}/expanded_assets/${tag}`]: assetsListing(tag, [
        'macos',
        'windows',
      ]),
      [`${base}/expanded_assets/${previousTag}`]: assetsListing(previousTag, [
        'linux',
      ]),
    });
    const partial = parseReleaseStatus('desktop', {
      schema: 1,
      platform: 'desktop',
      channel: 'beta',
      store: 'github-release',
      version: '0.27.29',
      build: 1000002,
      desktopRelease: release(tag, ['macos']),
    });
    const result = await getDesktopRelease(
      '0.27.29',
      1000002,
      partial?.desktopRelease
    );
    expect(
      result?.downloads.map(({ platform, tag, size }) => [platform, tag, size])
    ).toEqual([
      ['macos', tag, 12345],
      ['windows', tag, null],
      ['linux', previousTag, null],
    ]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${base}.atom`,
      `${base}/expanded_assets/${tag}`,
      `${base}/expanded_assets/${previousTag}`,
    ]);
  });

  it('retains the newest verified packages during failure without extending the TTL', async () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(50_000);
    const cache = stubEdgeCache();
    stubFetch({
      [`${api}?per_page=100`]: [
        release(tag, ['windows', 'macos', 'linux']),
        release(previousTag, ['macos']),
      ],
    });
    expect((await getDesktopRelease())?.tag).toBe(tag);

    stubFetch({ [`${api}?per_page=100`]: new Response(null, { status: 429 }) });
    now.mockReturnValue(50_000 + 3_500_000);
    expect(
      (await getDesktopRelease())?.downloads.map((download) => download.tag)
    ).toEqual([tag, tag, tag]);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0]?.[1].headers.get('cache-control')).toBe(
      'public, max-age=3600'
    );

    now.mockReturnValue(50_000 + 3_600_000);
    expect(await getDesktopRelease()).toBeNull();
  });

  it('clears a cached release when its public tag is confirmed missing', async () => {
    const cache = stubEdgeCache();
    stubFetch({ [`${api}?per_page=100`]: [release(tag, ['macos'])] });
    expect((await getDesktopRelease())?.tag).toBe(tag);
    stubFetch({
      [`${base}/expanded_assets/${tag}`]: new Response(null, { status: 404 }),
    });
    expect(await getDesktopRelease('0.27.29', 1000002)).toBeNull();
    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect(await getDesktopRelease()).toBeNull();
  });

  it.each(['manifest', 'public listing'] as const)(
    'keeps cached platforms when an outage leaves only a same-tag partial %s',
    async (source) => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(50_000);
      const cache = stubEdgeCache();
      stubFetch({
        [`${api}?per_page=100`]: [
          release(tag, ['windows', 'macos']),
          release(previousTag, ['linux']),
        ],
      });
      expect((await getDesktopRelease())?.downloads).toHaveLength(3);

      const partial = parseReleaseStatus('desktop', {
        schema: 1,
        platform: 'desktop',
        channel: 'beta',
        store: 'github-release',
        version: '0.27.29',
        build: 1000002,
        desktopRelease: release(tag, ['macos']),
      });
      const readDuringOutage = () => {
        stubFetch({
          [`${base}/expanded_assets/${tag}`]: assetsListing(tag, ['macos']),
        });
        return getDesktopRelease(
          '0.27.29',
          1000002,
          source === 'manifest' ? partial?.desktopRelease : undefined
        );
      };

      now.mockReturnValue(50_000 + 3_500_000);
      const result = await readDuringOutage();
      expect(result?.downloads.map(({ platform }) => platform).sort()).toEqual([
        'linux',
        'macos',
        'windows',
      ]);
      expect(
        result?.downloads.find((item) => item.platform === 'macos')?.size
      ).toBe(source === 'manifest' ? 12345 : null);
      expect(cache.put).toHaveBeenCalledTimes(1);

      now.mockReturnValue(50_000 + 3_600_000);
      expect(
        (await readDuringOutage())?.downloads.map((item) => item.platform)
      ).toEqual(['macos']);
    }
  );
});
