import { DESKTOP_REPOSITORY } from './desktop-downloads';

// Beta release facts the store pipeline publishes after each store verifies a
// build: one monotonic JSON file per platform on a fixed GitHub release.
export const RELEASE_STATUS_PLATFORMS = ['ios', 'android', 'desktop'] as const;
export type ReleaseStatusPlatform = (typeof RELEASE_STATUS_PLATFORMS)[number];

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
  return `https://github.com/${DESKTOP_REPOSITORY}/releases/download/app-release-status/${platform}.json`;
}

const SEMVER = /^\d+\.\d+\.\d+$/;
// The label is display text: the version and build, optionally followed by a
// short note such as "android fix". Anything else is ignored.
const LABEL =
  /^(\d+\.\d+\.\d+) \(build (\d+)(?:, ([\p{L}\p{N} .-]{1,40}))?\)$/u;

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
    status.build <= 0 ||
    typeof status.label !== 'string'
  )
    return null;
  const label = status.label.match(LABEL);
  if (label?.[1] !== status.version || label[2] !== String(status.build))
    return null;
  return {
    version: status.version,
    build: status.build,
    note: label[3]?.trim() || null,
  };
}
