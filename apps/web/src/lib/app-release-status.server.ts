import 'server-only';
import { cacheLife } from 'next/cache';
import {
  type BetaReleaseStatus,
  type BetaReleaseStatuses,
  parseReleaseStatus,
  RELEASE_STATUS_PLATFORMS,
  type ReleaseStatusPlatform,
  releaseStatusUrl,
  selectHighestRecord,
  shardTagsFromRefs,
} from './app-release-status';
import { DESKTOP_REPOSITORY } from './desktop-downloads';

const API = `https://api.github.com/repos/${DESKTOP_REPOSITORY}`;

// Thrown for any outcome that is not definitive (network error, timeout,
// rate limit, server error), so it is never cached as "unavailable".
class TransientStatusError extends Error {}

type Lookup = { found: true; value: unknown } | { found: false };

async function fetchJson(url: string): Promise<Lookup> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new TransientStatusError(url);
  }
  if (response.status === 404) return { found: false };
  if (!response.ok) throw new TransientStatusError(url);
  try {
    return { found: true, value: await response.json() };
  } catch {
    throw new TransientStatusError(url);
  }
}

// Walks the platform's shard releases from the highest down and returns the
// highest uploaded record. Only the shard tags and the shard releases are
// requested, so the scan does not depend on how many other releases exist.
async function readHighestRecord(
  platform: ReleaseStatusPlatform,
  tags: string[]
): Promise<BetaReleaseStatus | null> {
  for (const tag of tags) {
    const release = await fetchJson(`${API}/releases/tags/${tag}`);
    if (!release.found) continue;
    const record = selectHighestRecord(platform, [release.value]);
    if (!record) continue;
    const document = await fetchJson(record.url);
    // A record listed as uploaded must be readable; anything else is a
    // transient failure, not a missing channel.
    if (!document.found) throw new TransientStatusError(record.url);
    const status = parseReleaseStatus(platform, document.value);
    if (status?.build !== record.build)
      throw new TransientStatusError(record.url);
    return status;
  }
  return null;
}

async function readPointer(platform: ReleaseStatusPlatform) {
  const pointer = await fetchJson(releaseStatusUrl(platform));
  return pointer.found ? parseReleaseStatus(platform, pointer.value) : null;
}

export async function resolveBetaReleaseStatuses(): Promise<{
  statuses: BetaReleaseStatuses;
  definitive: boolean;
}> {
  let definitive = true;
  const settle = async <T>(work: () => Promise<T>, fallback: T) => {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof TransientStatusError)) throw error;
      definitive = false;
      return fallback;
    }
  };

  const pointers = await Promise.all(
    RELEASE_STATUS_PLATFORMS.map((platform) =>
      settle(() => readPointer(platform), null)
    )
  );
  // The pointer is briefly absent while the pipeline replaces it; fall back
  // to the immutable records for any platform without a readable pointer.
  const missing = RELEASE_STATUS_PLATFORMS.filter(
    (_, index) => pointers[index] === null
  );
  const refs =
    missing.length === 0
      ? []
      : await settle(async () => {
          const result = await fetchJson(
            `${API}/git/matching-refs/tags/app-release-status-`
          );
          return result.found ? result.value : [];
        }, null);

  const statuses = await Promise.all(
    RELEASE_STATUS_PLATFORMS.map(async (platform, index) => {
      const pointer = pointers[index] ?? null;
      if (pointer || refs === null) return [platform, pointer] as const;
      const record = await settle(
        () => readHighestRecord(platform, shardTagsFromRefs(platform, refs)),
        null
      );
      return [platform, record] as const;
    })
  );
  return {
    statuses: Object.fromEntries(statuses) as BetaReleaseStatuses,
    definitive,
  };
}

// A definitive answer is cached for five minutes. A transient failure still
// renders the page, without the affected channels, and is retried after 30
// seconds instead of being held as "unavailable".
export async function getBetaReleaseStatuses(): Promise<BetaReleaseStatuses> {
  'use cache';
  const { statuses, definitive } = await resolveBetaReleaseStatuses();
  cacheLife(
    definitive
      ? { stale: 300, revalidate: 300, expire: 3600 }
      : { stale: 30, revalidate: 30, expire: 300 }
  );
  return statuses;
}
