const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  checkPlatformReleaseVersion,
  syncManagedFile,
  syncPlatformReleaseVersion,
} = require('./sync-platform-release-version.js');

function createTempReleaseTree() {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'platform-release-version-')
  );

  fs.mkdirSync(path.join(rootDir, 'packages/utils/src'), {
    recursive: true,
  });
  fs.writeFileSync(path.join(rootDir, 'platform-version.txt'), '0.5.0\n');
  fs.writeFileSync(
    path.join(rootDir, '.release-please-manifest.json'),
    `${JSON.stringify({ '.': '0.5.0' }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(rootDir, 'packages/utils/src/platform-release.ts'),
    "export const TUTURUUU_PLATFORM_VERSION = '0.4.13'; // x-release-please-version\n"
  );
  fs.writeFileSync(
    path.join(rootDir, 'packages/utils/src/platform-release.test.ts'),
    "expect(TUTURUUU_PLATFORM_VERSION).toBe('0.4.13'); // x-release-please-version\n"
  );

  return rootDir;
}

test('syncPlatformReleaseVersion updates platform release files from platform-version.txt', () => {
  const rootDir = createTempReleaseTree();

  assert.throws(
    () => checkPlatformReleaseVersion({ rootDir }),
    /packages\/utils\/src\/platform-release\.ts has 0\.4\.13, expected 0\.5\.0/
  );

  const result = syncPlatformReleaseVersion({ rootDir });

  assert.deepEqual(result, {
    changedFiles: [
      'packages/utils/src/platform-release.ts',
      'packages/utils/src/platform-release.test.ts',
    ],
    version: '0.5.0',
  });
  assert.doesNotThrow(() => checkPlatformReleaseVersion({ rootDir }));
});

test('syncManagedFile collapses release-please conflict markers', () => {
  const text = [
    'import { PLATFORM_BUILD_METADATA } from "./generated/platform-build-metadata";',
    '',
    '<<<<<<< HEAD',
    "export const TUTURUUU_PLATFORM_VERSION = '0.4.13'; // x-release-please-version",
    '=======',
    "export const TUTURUUU_PLATFORM_VERSION = '0.5.0'; // x-release-please-version",
    '>>>>>>> origin/release-please--branches--production',
    '',
    'export type PlatformBuildMetadataInput = {};',
    '',
  ].join('\n');
  const updated = syncManagedFile(
    text,
    /export const TUTURUUU_PLATFORM_VERSION = '([^']+)'; \/\/ x-release-please-version/g,
    "export const TUTURUUU_PLATFORM_VERSION = '0.5.0'; // x-release-please-version"
  );

  assert.equal(
    updated,
    [
      'import { PLATFORM_BUILD_METADATA } from "./generated/platform-build-metadata";',
      '',
      "export const TUTURUUU_PLATFORM_VERSION = '0.5.0'; // x-release-please-version",
      '',
      'export type PlatformBuildMetadataInput = {};',
      '',
    ].join('\n')
  );
});
