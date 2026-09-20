import 'server-only';
import { cacheLife } from 'next/cache';
import { DESKTOP_REPOSITORY, findDesktopRelease } from './desktop-downloads';

export async function getDesktopRelease() {
  'use cache';
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  try {
    // Public metadata needs no token. Package bytes go straight to GitHub's
    // release CDN; our servers never proxy multi-hundred-megabyte downloads.
    const response = await fetch(
      `https://api.github.com/repos/${DESKTOP_REPOSITORY}/releases?per_page=100`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) return null;
    return findDesktopRelease(await response.json());
  } catch {
    return null;
  }
}
