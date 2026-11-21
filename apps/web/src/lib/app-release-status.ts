import { DESKTOP_REPOSITORY } from './desktop-downloads';

// Beta release facts the store pipeline publishes after each store verifies a
// build. `<platform>.json` on the `app-release-status` release points at the
// newest verified build and never moves backwards. Immutable
// `<platform>-<build>.json` records live on the
// `app-release-status-<platform>-<shard>` releases, which readers use while
// the pointer is being replaced.
export const RELEASE_STATUS_PLATFORMS = ['ios', 'android', 'desktop'] as const;
export type ReleaseStatusPlatform = (typeof RELEASE_STATUS_PLATFORMS)[number];

const STATUS_TAG = 'app-release-status';
const RELEASES = `https://github.com/${DESKTOP_REPOSITORY}/releases`;

const STORES: Record<ReleaseStatusPlatform, string> = {
  ios: 'testflight',
  android: 'google-play-internal',
  desktop: 'github-release',
};

export type BetaReleaseStatus = {
  version: string;
  build: number;
  // Short pipeline note from the label, such as "android fix".
  note: string | null;
};

export type BetaReleaseStatuses = Record<
  ReleaseStatusPlatform,
  BetaReleaseStatus | null
>;

export function releaseStatusUrl(platform: ReleaseStatusPlatform) {
  return `${RELEASES}/download/${STATUS_TAG}/${platform}.json`;
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const NOTE = /^[\w .,/-]{1,60}$/u;

// The page shows the authoritative version and build fields. The label adds
// only an optional note, taken when the label is exactly
// "X.Y.Z (build B, note)" for this version and build.
function labelNote(label: unknown, version: string, build: number) {
  if (typeof label !== 'string') return null;
  const prefix = `${version} (build ${build}, `;
  if (!label.startsWith(prefix) || !label.endsWith(')')) return null;
  const note = label.slice(prefix.length, -1).trim();
  return NOTE.test(note) ? note : null;
}

// Accepts only a well-formed beta status for the expected platform and store,
// so a malformed or foreign file reads as "unavailable".
export function parseReleaseStatus(
  platform: ReleaseStatusPlatform,
  value: unknown
): BetaReleaseStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = value as Record<string, unknown>;
  if (
    status.schema !== 1 ||
    status.platform !== platform ||
    status.channel !== 'beta' ||
    status.store !== STORES[platform] ||
    typeof status.version !== 'string' ||
    !SEMVER.test(status.version) ||
    typeof status.build !== 'number' ||
    !Number.isSafeInteger(status.build) ||
    status.build <= 0
  )
    return null;
  return {
    version: status.version,
    build: status.build,
    note: labelNote(status.label, status.version, status.build),
  };
}

// Shard release tags for a platform, highest shard first, from a
// `git/matching-refs/tags/app-release-status-` response.
export function shardTagsFromRefs(
  platform: ReleaseStatusPlatform,
  refs: unknown
): string[] {
  if (!Array.isArray(refs)) return [];
  const shardRef = new RegExp(
    `^refs/tags/(${STATUS_TAG}-${platform}-(\\d{1,9}))$`,
    'u'
  );
  return refs
    .map((entry) => {
      const ref = (entry as { ref?: unknown })?.ref;
      const match = typeof ref === 'string' ? shardRef.exec(ref) : null;
      return match?.[1] ? { tag: match[1], shard: Number(match[2]) } : null;
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => b.shard - a.shard)
    .map((entry) => entry.tag);
}

const RECORD = /^(android|desktop|ios)-([1-9]\d{0,9})\.json$/u;

export type ReleaseStatusRecord = { url: string; build: number };

// Picks the highest uploaded per-build record from a GitHub release listing:
// the highest shard holding one, then the highest build in it. The download
// URL is rebuilt from the validated tag and asset name, never taken from the
// provider response.
export function selectHighestRecord(
  platform: ReleaseStatusPlatform,
  releases: unknown
): ReleaseStatusRecord | null {
  if (!Array.isArray(releases)) return null;
  const shardTag = new RegExp(`^${STATUS_TAG}-${platform}-(\\d{1,9})$`, 'u');
  const shards = releases
    .map((release) => {
      const tag = (release as { tag_name?: unknown })?.tag_name;
      const match = typeof tag === 'string' ? shardTag.exec(tag) : null;
      return match
        ? { tag: tag as string, shard: Number(match[1]), release }
        : null;
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => b.shard - a.shard);

  for (const { tag, release } of shards) {
    const assets = (release as { assets?: unknown }).assets;
    let best: ReleaseStatusRecord | null = null;
    for (const asset of Array.isArray(assets) ? assets : []) {
      const { name, state } = (asset ?? {}) as Record<string, unknown>;
      const match = typeof name === 'string' ? RECORD.exec(name) : null;
      if (!match || match[1] !== platform || state !== 'uploaded') continue;
      const build = Number(match[2]);
      if (!best || build > best.build)
        best = { url: `${RELEASES}/download/${tag}/${name}`, build };
    }
    if (best) return best;
  }
  return null;
}
