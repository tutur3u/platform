import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));

import { resolveBetaReleaseStatuses } from './app-release-status.server';

const RELEASES = 'https://github.com/tutur3u/platform/releases/download';
const API = 'https://api.github.com/repos/tutur3u/platform';

const doc = (platform: string, store: string, build: number) => ({
  schema: 1,
  platform,
  channel: 'beta',
  store,
  version: '0.27.27',
  build,
  label: `0.27.27 (build ${build})`,
  sha: 'a'.repeat(40),
  publishedAt: '2026-11-21T03:00:00Z',
});

function stubFetch(routes: Record<string, number | unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const route = routes[url];
      if (route === undefined) return new Response('', { status: 404 });
      if (typeof route === 'number') return new Response('', { status: route });
      return Response.json(route);
    })
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('beta status resolution', () => {
  it('uses pointers without listing anything else', async () => {
    const calls = stubFetch({
      [`${RELEASES}/app-release-status/ios.json`]: doc(
        'ios',
        'testflight',
        1000002
      ),
      [`${RELEASES}/app-release-status/android.json`]: doc(
        'android',
        'google-play-internal',
        1000001
      ),
      [`${RELEASES}/app-release-status/desktop.json`]: doc(
        'desktop',
        'github-release',
        1000000
      ),
    });
    const { statuses, definitive } = await resolveBetaReleaseStatuses();
    expect(definitive).toBe(true);
    expect(statuses.ios?.build).toBe(1000002);
    expect(calls).toHaveLength(3);
  });

  it('falls back to the highest record by shard tag, however old the shard release', async () => {
    const calls = stubFetch({
      [`${RELEASES}/app-release-status/android.json`]: doc(
        'android',
        'google-play-internal',
        1000001
      ),
      [`${RELEASES}/app-release-status/desktop.json`]: doc(
        'desktop',
        'github-release',
        1000000
      ),
      [`${API}/git/matching-refs/tags/app-release-status-`]: [
        { ref: 'refs/tags/app-release-status' },
        { ref: 'refs/tags/app-release-status-ios-2000' },
        { ref: 'refs/tags/app-release-status-ios-2001' },
      ],
      // The newest shard exists but has no finished record yet.
      [`${API}/releases/tags/app-release-status-ios-2001`]: {
        tag_name: 'app-release-status-ios-2001',
        assets: [{ name: 'ios-1000500.json', state: 'starter' }],
      },
      [`${API}/releases/tags/app-release-status-ios-2000`]: {
        tag_name: 'app-release-status-ios-2000',
        assets: [
          { name: 'ios-1000003.json', state: 'uploaded' },
          { name: 'ios-1000004.json', state: 'uploaded' },
        ],
      },
      [`${RELEASES}/app-release-status-ios-2000/ios-1000004.json`]: doc(
        'ios',
        'testflight',
        1000004
      ),
    });
    const { statuses, definitive } = await resolveBetaReleaseStatuses();
    expect(definitive).toBe(true);
    expect(statuses.ios?.build).toBe(1000004);
    expect(calls.some((url) => url.includes('/releases?'))).toBe(false);
  });

  it('reports unavailable only after a completed lookup finds nothing', async () => {
    stubFetch({ [`${API}/git/matching-refs/tags/app-release-status-`]: [] });
    const { statuses, definitive } = await resolveBetaReleaseStatuses();
    expect(definitive).toBe(true);
    expect(statuses).toEqual({ ios: null, android: null, desktop: null });
  });

  it.each([403, 429, 500])(
    'does not treat a %i tag listing as an empty catalog',
    async (status) => {
      stubFetch({
        [`${API}/git/matching-refs/tags/app-release-status-`]: status,
      });
      const { statuses, definitive } = await resolveBetaReleaseStatuses();
      expect(definitive).toBe(false);
      expect(statuses.ios).toBeNull();
    }
  );

  it('marks a failed pointer read as transient', async () => {
    stubFetch({
      [`${RELEASES}/app-release-status/ios.json`]: 503,
      [`${API}/git/matching-refs/tags/app-release-status-`]: [],
    });
    expect((await resolveBetaReleaseStatuses()).definitive).toBe(false);
  });

  it('does not accept a record whose content disagrees with its file name', async () => {
    stubFetch({
      [`${API}/git/matching-refs/tags/app-release-status-`]: [
        { ref: 'refs/tags/app-release-status-ios-2000' },
      ],
      [`${API}/releases/tags/app-release-status-ios-2000`]: {
        tag_name: 'app-release-status-ios-2000',
        assets: [{ name: 'ios-1000004.json', state: 'uploaded' }],
      },
      [`${RELEASES}/app-release-status-ios-2000/ios-1000004.json`]: doc(
        'ios',
        'testflight',
        1000009
      ),
    });
    const { statuses, definitive } = await resolveBetaReleaseStatuses();
    expect(statuses.ios).toBeNull();
    expect(definitive).toBe(false);
  });
});
