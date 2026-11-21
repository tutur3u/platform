import 'server-only';
import { cacheLife } from 'next/cache';
import {
  DESKTOP_PLATFORMS,
  DESKTOP_REPOSITORY,
  findDesktopRelease,
  parseDesktopRelease,
} from './desktop-downloads';

const RELEASES_API = `https://api.github.com/repos/${DESKTOP_REPOSITORY}/releases`;

async function readReleaseJson(
  path: string,
  signal: AbortSignal
): Promise<unknown> {
  try {
    const response = await fetch(`${RELEASES_API}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub rejects Workerd requests that omit a User-Agent.
        'User-Agent': 'Tuturuuu-Desktop-Downloads',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'manual',
      signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getDesktopRelease(version?: string, build?: number) {
  'use cache';
  const signal = AbortSignal.timeout(5000);
  const recent = findDesktopRelease(
    await readReleaseJson('?per_page=100', signal)
  );
  let release = recent;
  // GitHub's published catalog takes precedence over the status pointer. The
  // publisher updates the pointer after publication, and the write can lag.
  const tag =
    recent?.downloads.length !== DESKTOP_PLATFORMS.length &&
    version &&
    /^\d+\.\d+\.\d+$/.test(version) &&
    build !== undefined &&
    Number.isSafeInteger(build) &&
    build > 0
      ? `desktop-v${version}-${build}`
      : null;
  const published = tag
    ? parseDesktopRelease(await readReleaseJson(`/tags/${tag}`, signal))
    : null;
  if (published && published.tag === tag) {
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
  // Partial releases are normal. A shorter refresh can exhaust GitHub's
  // unauthenticated quota even with only one warm cache entry.
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  return release;
}
