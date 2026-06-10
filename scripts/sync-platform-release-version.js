#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const VERSION_FILE = 'platform-version.txt';
const MANIFEST_FILE = '.release-please-manifest.json';
const PLATFORM_RELEASE_FILE = 'packages/utils/src/platform-release.ts';
const PLATFORM_RELEASE_TEST_FILE =
  'packages/utils/src/platform-release.test.ts';
const VERSION_REGEX = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const CONFLICT_BLOCK_REGEX = /^<<<<<<<[^\n]*\n[\s\S]*?^>>>>>>>[^\n]*(?:\n)?/gm;
const CONFLICT_MARKER_REGEX = /^(<<<<<<<|=======|>>>>>>>) /m;
const PLATFORM_CONSTANT_REGEX =
  /export const TUTURUUU_PLATFORM_VERSION = '([^']+)'; \/\/ x-release-please-version/g;
const PLATFORM_EXPECTATION_REGEX =
  /expect\(TUTURUUU_PLATFORM_VERSION\)\.toBe\('([^']+)'\); \/\/ x-release-please-version/g;

const managedFiles = [
  {
    path: PLATFORM_RELEASE_FILE,
    regex: PLATFORM_CONSTANT_REGEX,
    replacement: (version) =>
      `export const TUTURUUU_PLATFORM_VERSION = '${version}'; // x-release-please-version`,
  },
  {
    path: PLATFORM_RELEASE_TEST_FILE,
    regex: PLATFORM_EXPECTATION_REGEX,
    replacement: (version) =>
      `expect(TUTURUUU_PLATFORM_VERSION).toBe('${version}'); // x-release-please-version`,
  },
];

function readText(rootDir, relativePath, fsImpl = fs) {
  return fsImpl.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function writeText(rootDir, relativePath, content, fsImpl = fs) {
  fsImpl.writeFileSync(path.join(rootDir, relativePath), content);
}

function readPlatformVersion(rootDir = ROOT_DIR, fsImpl = fs) {
  const version = readText(rootDir, VERSION_FILE, fsImpl).trim();

  if (!VERSION_REGEX.test(version)) {
    throw new Error(
      `${VERSION_FILE} must contain a semantic version, received "${version}".`
    );
  }

  return version;
}

function readManifest(rootDir = ROOT_DIR, fsImpl = fs) {
  return JSON.parse(readText(rootDir, MANIFEST_FILE, fsImpl));
}

function countMatches(text, regex) {
  regex.lastIndex = 0;
  const matches = [...text.matchAll(regex)];
  regex.lastIndex = 0;
  return matches;
}

function collapseReleaseVersionConflicts(text, regex, replacementLine) {
  regex.lastIndex = 0;

  return text.replace(CONFLICT_BLOCK_REGEX, (block) => {
    regex.lastIndex = 0;
    return regex.test(block) ? `${replacementLine}\n` : block;
  });
}

function syncManagedFile(text, regex, replacementLine) {
  const collapsed = collapseReleaseVersionConflicts(
    text,
    regex,
    replacementLine
  );
  const matches = countMatches(collapsed, regex);

  if (matches.length === 0) {
    throw new Error(
      `Could not find release-please version marker for: ${replacementLine}`
    );
  }

  regex.lastIndex = 0;
  return collapsed.replace(regex, replacementLine);
}

function checkManagedFile(text, regex, expectedVersion, relativePath) {
  const errors = [];

  if (CONFLICT_MARKER_REGEX.test(text)) {
    errors.push(`${relativePath} still contains merge conflict markers.`);
  }

  const matches = countMatches(text, regex);

  if (matches.length === 0) {
    errors.push(
      `${relativePath} is missing its x-release-please-version marker.`
    );
    return errors;
  }

  for (const match of matches) {
    if (match[1] !== expectedVersion) {
      errors.push(
        `${relativePath} has ${match[1]}, expected ${expectedVersion} from ${VERSION_FILE}.`
      );
    }
  }

  return errors;
}

function checkPlatformReleaseVersion(options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  const fsImpl = options.fsImpl ?? fs;
  const version = readPlatformVersion(rootDir, fsImpl);
  const manifest = readManifest(rootDir, fsImpl);
  const errors = [];

  if (manifest['.'] !== version) {
    errors.push(
      `${MANIFEST_FILE} has platform version ${manifest['.']}, expected ${version} from ${VERSION_FILE}.`
    );
  }

  for (const file of managedFiles) {
    const text = readText(rootDir, file.path, fsImpl);
    errors.push(...checkManagedFile(text, file.regex, version, file.path));
  }

  if (errors.length > 0) {
    throw new Error(
      [
        'Platform release version files are not aligned:',
        ...errors.map((error) => `- ${error}`),
        'Run `bun release:sync-platform-version` after merging a release-please branch, then rerun `bun check`.',
      ].join('\n')
    );
  }

  return { version };
}

function syncPlatformReleaseVersion(options = {}) {
  const rootDir = options.rootDir ?? ROOT_DIR;
  const fsImpl = options.fsImpl ?? fs;
  const version = readPlatformVersion(rootDir, fsImpl);
  const changedFiles = [];

  for (const file of managedFiles) {
    const text = readText(rootDir, file.path, fsImpl);
    const replacementLine = file.replacement(version);
    const updated = syncManagedFile(text, file.regex, replacementLine);

    if (updated !== text) {
      writeText(rootDir, file.path, updated, fsImpl);
      changedFiles.push(file.path);
    }
  }

  checkPlatformReleaseVersion({ fsImpl, rootDir });

  return { changedFiles, version };
}

function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  try {
    if (checkOnly) {
      const { version } = checkPlatformReleaseVersion();
      console.log(`Platform release version files are aligned at ${version}.`);
      return;
    }

    const { changedFiles, version } = syncPlatformReleaseVersion();

    if (changedFiles.length === 0) {
      console.log(`Platform release version files already use ${version}.`);
      return;
    }

    console.log(`Synced platform release version files to ${version}:`);
    for (const file of changedFiles) {
      console.log(`- ${file}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPlatformReleaseVersion,
  syncManagedFile,
  syncPlatformReleaseVersion,
};
