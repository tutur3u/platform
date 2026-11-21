import 'server-only';
import { cacheLife } from 'next/cache';
import {
  type BetaReleaseStatuses,
  parseReleaseStatus,
  RELEASE_STATUS_PLATFORMS,
  type ReleaseStatusPlatform,
  releaseStatusUrl,
} from './app-release-status';

async function fetchStatus(platform: ReleaseStatusPlatform) {
  // A file is briefly absent while the pipeline replaces it, so a miss gets
  // one short retry before the channel reads as unavailable.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(releaseStatusUrl(platform), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok)
        return parseReleaseStatus(platform, await response.json());
    } catch {
      // Network or parse failure: retry once, then report unavailable.
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

export async function getBetaReleaseStatuses(): Promise<BetaReleaseStatuses> {
  'use cache';
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  const entries = await Promise.all(
    RELEASE_STATUS_PLATFORMS.map(
      async (platform) => [platform, await fetchStatus(platform)] as const
    )
  );
  return Object.fromEntries(entries) as BetaReleaseStatuses;
}
