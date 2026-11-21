import 'server-only';
import { readBoundedResponseBytes } from '@tuturuuu/utils/read-bounded-response';
import { cacheLife } from 'next/cache';
import {
  DESKTOP_PLATFORMS,
  DESKTOP_REPOSITORY,
  type DesktopRelease,
  findDesktopRelease,
} from './desktop-downloads';
import {
  compareDesktopReleaseTags,
  DESKTOP_RELEASES_WEB,
  mergeDesktopReleases,
  parseDesktopReleaseAssets,
  parseDesktopReleaseFeed,
} from './desktop-release-assets';
import {
  cacheDesktopRelease,
  clearCachedDesktopRelease,
  readCachedDesktopRelease,
} from './desktop-release-cache.server';

const RELEASES_API = `https://api.github.com/repos/${DESKTOP_REPOSITORY}/releases`;
const USER_AGENT = 'Tuturuuu-Desktop-Downloads';

async function readReleaseCatalog(): Promise<unknown> {
  try {
    const response = await fetch(`${RELEASES_API}?per_page=100`, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub rejects Workerd requests that omit a User-Agent.
        'User-Agent': USER_AGENT,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      console.warn('Desktop beta GitHub API lookup failed', {
        status: response.status,
      });
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return await response.json();
  } catch {
    console.warn('Desktop beta GitHub API response could not be read');
    return null;
  }
}

async function readPublicReleaseAssets(
  tag: string,
  signal = AbortSignal.timeout(2000)
) {
  try {
    const response = await fetch(
      `${DESKTOP_RELEASES_WEB}/expanded_assets/${tag}`,
      {
        headers: {
          Accept: 'text/html',
          'Accept-Language': 'en',
          'User-Agent': USER_AGENT,
        },
        redirect: 'manual',
        signal,
      }
    );
    if (!response.ok) {
      console.warn('Desktop beta public asset lookup failed', {
        status: response.status,
      });
      await response.body?.cancel().catch(() => undefined);
      return { release: null, missing: response.status === 404 };
    }
    const bytes = await readBoundedResponseBytes({
      response,
      maxBytes: 64 * 1024,
    });
    const release = parseDesktopReleaseAssets(
      tag,
      new TextDecoder().decode(bytes)
    );
    if (!release)
      console.warn(
        'Desktop beta public asset listing had no verified packages'
      );
    return { release, missing: false };
  } catch {
    console.warn('Desktop beta public asset response could not be read');
    return { release: null, missing: false };
  }
}

async function readPublicReleaseFeed(): Promise<string[]> {
  try {
    const response = await fetch(`${DESKTOP_RELEASES_WEB}.atom`, {
      headers: { Accept: 'application/atom+xml', 'User-Agent': USER_AGENT },
      redirect: 'manual',
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      console.warn('Desktop beta GitHub release feed lookup failed', {
        status: response.status,
      });
      await response.body?.cancel().catch(() => undefined);
      return [];
    }
    const bytes = await readBoundedResponseBytes({
      response,
      maxBytes: 256 * 1024,
    });
    return parseDesktopReleaseFeed(new TextDecoder().decode(bytes));
  } catch {
    console.warn('Desktop beta GitHub release feed could not be read');
    return [];
  }
}

async function refreshDesktopManifest(manifest: DesktopRelease) {
  let release = manifest;
  const tags = await readPublicReleaseFeed();
  const signal = AbortSignal.timeout(2000);
  for (const tag of tags.slice(0, 3)) {
    if (signal.aborted) break;
    if (
      release.downloads.length === DESKTOP_PLATFORMS.length &&
      release.downloads.every(
        (download) => compareDesktopReleaseTags(download.tag, tag) >= 0
      )
    )
      break;
    const listing = await readPublicReleaseAssets(tag, signal);
    release = mergeDesktopReleases(release, listing.release);
  }
  // The public feed is short and can be crowded out by non-desktop releases.
  const newest = tags[0];
  if (
    !newest ||
    compareDesktopReleaseTags(newest, release.tag) > 0 ||
    release.downloads.length !== DESKTOP_PLATFORMS.length
  ) {
    const recent = findDesktopRelease(await readReleaseCatalog());
    return {
      release: mergeDesktopReleases(release, recent),
      degraded: !recent,
    };
  }
  return { release, degraded: false };
}

type DesktopReleaseLookup = {
  release: DesktopRelease | null;
  expiresAt?: number;
  fresh?: DesktopRelease;
};

async function keepDesktopRelease(
  fresh: DesktopRelease,
  degraded: boolean
): Promise<DesktopReleaseLookup> {
  if (degraded) {
    const cached = await readCachedDesktopRelease();
    if (cached) {
      const release = mergeDesktopReleases(fresh, cached.release);
      if (
        release.downloads.some((item) =>
          cached.release.downloads.includes(item)
        )
      )
        return { release, expiresAt: cached.expiresAt, fresh };
    }
  }
  await cacheDesktopRelease(fresh);
  return { release: fresh };
}

async function lookupDesktopRelease(
  version?: string,
  build?: number,
  manifest?: DesktopRelease
): Promise<DesktopReleaseLookup> {
  'use cache';
  // Partial releases and upstream failures both retain the five-minute cadence.
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  if (manifest) {
    const { release, degraded } = await refreshDesktopManifest(manifest);
    return keepDesktopRelease(release, degraded);
  }
  const catalog = await readReleaseCatalog();
  const recent = findDesktopRelease(catalog);
  let release = recent;
  // Older status records have no manifest. Try the REST catalog, then fill
  // any gaps from the exact build's public asset listing.
  const tag =
    recent?.downloads.length !== DESKTOP_PLATFORMS.length &&
    version &&
    /^\d+\.\d+\.\d+$/.test(version) &&
    build !== undefined &&
    Number.isSafeInteger(build) &&
    build > 0
      ? `desktop-v${version}-${build}`
      : null;
  const publicListing = tag ? await readPublicReleaseAssets(tag) : null;
  const published = publicListing?.release;
  if (published) {
    release = recent
      ? {
          ...recent,
          downloads: [
            ...recent.downloads,
            ...published.downloads.filter(
              (item) =>
                !recent.downloads.some(
                  (asset) => asset.platform === item.platform
                )
            ),
          ],
        }
      : published;
  }
  if (release) return keepDesktopRelease(release, !Array.isArray(catalog));
  // A healthy but empty catalog or an explicit missing tag is authoritative.
  const cached = await readCachedDesktopRelease();
  if (
    Array.isArray(catalog) ||
    (publicListing?.missing &&
      cached?.release.downloads.some((item) => item.tag === tag))
  ) {
    await clearCachedDesktopRelease();
    return { release: null };
  }
  return cached ?? { release: null };
}

export async function getDesktopRelease(
  version?: string,
  build?: number,
  manifest?: DesktopRelease
): Promise<DesktopRelease | null> {
  const { release, expiresAt, fresh } = await lookupDesktopRelease(
    version,
    build,
    manifest
  );
  // Next can cache the result of a failed lookup beyond the edge entry's TTL.
  return expiresAt !== undefined && expiresAt <= Date.now()
    ? (fresh ?? null)
    : release;
}
