// One release ledger for every Flutter app channel (iOS, Android, macOS,
// Windows, Linux). Each production commit that ships gets one entry: a shared
// X.Y.Z and a shared, globally monotonic build number B. Entries are annotated
// git tags `app-b<B>` on that commit, so both store pipelines read the same
// history and an atomic ref create resolves races between them.

export const LEDGER_TAG_PREFIX = 'app-b';
/** Above every build number issued by the per-workflow scheme (578001). */
export const BUILD_FLOOR = 1_000_000;
/** Play versionCode and CFBundleVersion stay well inside 2^31. */
export const BUILD_CEILING = 2_100_000_000;
/** The first entry continues past desktop-v0.27.26 and mobile 0.27.20. */
export const MIGRATION_FLOOR_VERSION = '0.27.27';
export const PLATFORMS = ['android', 'ios', 'linux', 'macos', 'windows'];

// Bounded parts keep comparisons exact and every store's numeric limits safe.
const VERSION = /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/u;
const SHA = /^[a-f0-9]{40}$/u;
const TAG_NAME = /^app-b([1-9]\d{0,9})$/u;
const ENTRY_KEYS = ['build', 'platforms', 'sha', 'shared', 'version'];

export function parseVersion(value) {
  const match = VERSION.exec(typeof value === 'string' ? value : '');
  return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error('Versions must be major.minor.patch');
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function pubspecVersion(pubspec) {
  const match = /^version:\s*(\d+\.\d+\.\d+)(?:\+\d+)?\s*$/mu.exec(pubspec);
  if (!match || !parseVersion(match[1]))
    throw new Error('Mobile pubspec version must be major.minor.patch');
  return match[1];
}

export function tagBuild(name) {
  const match = TAG_NAME.exec(name ?? '');
  const build = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(build) && build <= BUILD_CEILING ? build : null;
}

// Files that never ship in an app binary: they neither bump the patch nor
// label a platform.
const NON_SHIPPING = [
  /^apps\/mobile\/(?:test|integration_test|test_driver|docs|coverage|tool)\//u,
  /^apps\/mobile\/(?:analysis_options|devtools_options)\.yaml$/u,
  /^apps\/mobile\/coverage_badge\.svg$/u,
  /\.md$/u,
  // Pipeline tests never ship in a binary.
  /\.test\.[cm]?[jt]s$/u,
  /(?:^|\/)test_[^/]+\.py$/u,
];
const PLATFORM_PATHS = [
  ...PLATFORMS.map((platform) => [`apps/mobile/${platform}/`, [platform]]),
  // Plugin vendored for one platform only.
  ['apps/mobile/vendor/record_ios/', ['ios']],
  ['scripts/mobile-deployment/', ['android', 'ios']],
  ['scripts/desktop-deployment/', ['linux', 'macos', 'windows']],
];

/**
 * Shared app code ships to every platform and moves the patch. Platform trees
 * and pipeline scripts only produce a platform-labeled build of the same X.Y.Z.
 * Pass both sides of a rename.
 */
export function classifyChanges(files) {
  const platforms = new Set();
  let shared = false;
  for (const file of files) {
    if (NON_SHIPPING.some((pattern) => pattern.test(file))) continue;
    const match = PLATFORM_PATHS.find(([prefix]) => file.startsWith(prefix));
    if (match) for (const platform of match[1]) platforms.add(platform);
    else if (file.startsWith('apps/mobile/')) shared = true;
  }
  return { shared, platforms: [...platforms].sort() };
}

/** Strictly validates one annotated ledger tag; anything else is rejected. */
export function parseEntry(tagName, message, target) {
  const build = tagBuild(tagName);
  if (build === null || !SHA.test(target ?? '')) return null;
  let data;
  try {
    data = JSON.parse(message);
  } catch {
    return null;
  }
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).sort().join() !== ENTRY_KEYS.join() ||
    data.build !== build ||
    !parseVersion(data.version) ||
    data.sha !== target ||
    typeof data.shared !== 'boolean' ||
    !Array.isArray(data.platforms) ||
    data.platforms.some((platform) => !PLATFORMS.includes(platform)) ||
    new Set(data.platforms).size !== data.platforms.length
  )
    return null;
  return {
    build,
    version: data.version,
    sha: target,
    shared: data.shared,
    platforms: [...data.platforms].sort(),
  };
}

export function entryMessage(entry) {
  return JSON.stringify({
    build: entry.build,
    platforms: entry.platforms,
    sha: entry.sha,
    shared: entry.shared,
    version: entry.version,
  });
}

export function platformLabel(entry) {
  return entry.shared || !entry.platforms.length
    ? `${entry.version} (build ${entry.build})`
    : `${entry.version} (build ${entry.build}, ${entry.platforms.join('/')} fix)`;
}

/**
 * Decides the ledger entry for `sha`.
 * - `entries`: valid entries, newest build first.
 * - `reservedBuild`: the highest `app-b<B>` ref number, valid or not.
 * - `isAncestor(a, b)`: commit a is reachable from b.
 * - `changedFiles(a, b)`: paths changed between two commits.
 */
export function planAllocation({
  entries,
  reservedBuild = 0,
  sha,
  pubspec,
  floorVersion = MIGRATION_FLOOR_VERSION,
  isAncestor,
  changedFiles,
}) {
  if (!SHA.test(sha ?? '')) throw new Error('A full commit SHA is required');
  const latest = entries[0];
  // Builds follow source order: an older commit never ships after a newer one
  // allocated, even with an entry from an earlier run. The workflow then
  // dispatches a release of the production head for its own channel, which
  // carries this commit's changes forward under a newer build.
  if (latest && latest.sha !== sha && isAncestor(sha, latest.sha))
    return { action: 'superseded', latest };
  const existing = entries.find((entry) => entry.sha === sha);
  if (existing) return { action: 'reuse', entry: existing };

  const source = pubspecVersion(pubspec);
  const build = Math.max(reservedBuild, latest?.build ?? BUILD_FLOOR - 1) + 1;
  if (build > BUILD_CEILING) throw new Error('Build number ceiling reached');
  if (!latest) {
    const version =
      compareVersions(source, floorVersion) >= 0 ? source : floorVersion;
    return {
      action: 'create',
      entry: {
        build: Math.max(build, BUILD_FLOOR),
        version,
        sha,
        shared: true,
        platforms: [],
      },
    };
  }
  if (!isAncestor(latest.sha, sha))
    throw new Error('Production history diverged from the release ledger');

  const change = classifyChanges(changedFiles(latest.sha, sha));
  const [major, minor] = parseVersion(source);
  const [lastMajor, lastMinor, lastPatch] = parseVersion(latest.version);
  let version;
  if (major > lastMajor || (major === lastMajor && minor > lastMinor)) {
    // Release Please opened a new minor; its pubspec patch is the floor.
    version = source;
  } else if (change.shared) {
    version = `${lastMajor}.${lastMinor}.${lastPatch + 1}`;
  } else {
    version = latest.version;
  }
  return {
    action: 'create',
    entry: {
      build,
      version,
      sha,
      shared: version !== latest.version,
      platforms: change.platforms,
    },
  };
}

/**
 * Windows Store MSIX versions need a nonzero first part, revision 0 and parts
 * up to 65535. X.Y.Z maps to (X+1).Y.Z.0, which keeps the ordering.
 */
export function windowsPackageVersion(version) {
  const parts = parseVersion(version);
  if (!parts) throw new Error('Version must be major.minor.patch');
  const mapped = [parts[0] + 1, parts[1], parts[2]];
  if (mapped.some((part) => part > 65535))
    throw new Error('Version cannot map to a Windows package version');
  return `${mapped.join('.')}.0`;
}
