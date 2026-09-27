#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

const VERSION = /\d+\.\d+\.\d+(?:[-+][\w.-]+)?/;
const SEMVER = new RegExp(`^${VERSION.source}$`);
const RELEASE_BADGE = new Map([
  [
    'packages/utils/src/platform-release.ts',
    /(TUTURUUU_PLATFORM_VERSION = ')[^']+(')/,
  ],
  [
    'packages/utils/src/platform-release.test.ts',
    /(expect\(TUTURUUU_PLATFORM_VERSION\)\.toBe\(')[^']+('\); \/\/ x-release-please-version)/,
  ],
]);

function isVersionManifest(path) {
  return path === 'package.json' || path.endsWith('/package.json');
}

function sameExceptVersion(before, after) {
  const previous = JSON.parse(before);
  const current = JSON.parse(after);
  if (
    !previous ||
    !current ||
    typeof previous !== 'object' ||
    typeof current !== 'object' ||
    !SEMVER.test(previous.version ?? '') ||
    !SEMVER.test(current.version ?? '')
  ) {
    return false;
  }

  previous.version = '<version>';
  current.version = '<version>';
  return JSON.stringify(previous) === JSON.stringify(current);
}

function sameReleaseManifest(before, after) {
  const previous = JSON.parse(before);
  const current = JSON.parse(after);
  const keys = Object.keys(previous);
  return (
    keys.length === Object.keys(current).length &&
    keys.every(
      (key) =>
        Object.hasOwn(current, key) &&
        SEMVER.test(previous[key]) &&
        SEMVER.test(current[key])
    )
  );
}

function sameExceptReleaseVersion(path, before, after) {
  if (path === '.release-please-manifest.json') {
    return sameReleaseManifest(before, after);
  }
  if (path === 'platform-version.txt') {
    return SEMVER.test(before.trim()) && SEMVER.test(after.trim());
  }
  if (path === 'apps/mobile/pubspec.yaml') {
    const versionLine = /^version: \d+\.\d+\.\d+(?:[-+][\w.-]+)?(?:\+\d+)?$/m;
    return (
      versionLine.test(before) &&
      versionLine.test(after) &&
      before.replace(versionLine, 'version: <version>') ===
        after.replace(versionLine, 'version: <version>')
    );
  }

  const badgePattern = RELEASE_BADGE.get(path);
  if (badgePattern) {
    return (
      badgePattern.test(before) &&
      badgePattern.test(after) &&
      before.replace(badgePattern, '$1<version>$2') ===
        after.replace(badgePattern, '$1<version>$2')
    );
  }
  return false;
}

function shouldRunChecks(paths, readAt) {
  if (paths.length === 0) return true;

  for (const path of paths) {
    if (path === 'CHANGELOG.md' || path.endsWith('/CHANGELOG.md')) {
      continue;
    }
    if (!isVersionManifest(path) && !sameExceptReleaseVersionPath(path)) {
      return true;
    }

    try {
      const [before, after] = readAt(path);
      if (
        !(isVersionManifest(path)
          ? sameExceptVersion(before, after)
          : sameExceptReleaseVersion(path, before, after))
      ) {
        return true;
      }
    } catch {
      // Missing or malformed manifests must not suppress E2E.
      return true;
    }
  }
  return false;
}

function sameExceptReleaseVersionPath(path) {
  return (
    path === '.release-please-manifest.json' ||
    path === 'platform-version.txt' ||
    path === 'apps/mobile/pubspec.yaml' ||
    RELEASE_BADGE.has(path)
  );
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function main([before, after]) {
  if (!before || !after || /^0+$/.test(before)) {
    console.log('true');
    return;
  }

  try {
    const paths = git('diff', '--name-only', '-z', before, after)
      .split('\0')
      .filter(Boolean);
    const run = shouldRunChecks(paths, (path) => [
      git('show', `${before}:${path}`),
      git('show', `${after}:${path}`),
    ]);
    console.log(run ? 'true' : 'false');
  } catch (error) {
    console.error(
      `Release-only changes could not be determined: ${error.message}`
    );
    console.log('true');
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { sameExceptVersion, shouldRunChecks };
