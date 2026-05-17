#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const PACKAGE_JSON_PATH = 'packages/sdk/package.json';

function parseArgs(args) {
  const parsed = {
    base: process.env.BASE_REF || '',
    changedFiles: process.env.CHANGED_FILES || '',
    head: process.env.HEAD_REF || 'HEAD',
    mode: process.env.MODE || 'detect',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === '--base' && next) {
      parsed.base = next;
      index += 1;
      continue;
    }

    if (arg === '--changed-files' && next) {
      parsed.changedFiles = next;
      index += 1;
      continue;
    }

    if (arg === '--head' && next) {
      parsed.head = next;
      index += 1;
      continue;
    }

    if (arg === '--mode' && next) {
      parsed.mode = next;
      index += 1;
    }
  }

  return parsed;
}

function runGit(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function splitChangedFiles(value) {
  return value
    .split(/[\n,]/u)
    .map((filePath) => filePath.trim().replace(/\\/gu, '/'))
    .filter(Boolean);
}

function getChangedFiles({ base, changedFiles, head }) {
  if (changedFiles.trim()) {
    return splitChangedFiles(changedFiles);
  }

  if (!base.trim()) {
    throw new Error('Missing base ref. Pass --base or CHANGED_FILES.');
  }

  return splitChangedFiles(runGit(['diff', '--name-only', base, head]));
}

function readPackageJsonAt(ref) {
  const raw =
    ref === 'WORKTREE'
      ? readFileSync(PACKAGE_JSON_PATH, 'utf8')
      : runGit(['show', `${ref}:${PACKAGE_JSON_PATH}`]);

  return JSON.parse(raw);
}

function isReleaseImpactingSdkPath(filePath) {
  if (!filePath.startsWith('packages/sdk/')) {
    return false;
  }

  if (filePath.startsWith('packages/sdk/src/')) {
    return true;
  }

  return [
    'packages/sdk/LICENSE',
    'packages/sdk/README.md',
    'packages/sdk/package.json',
    'packages/sdk/tsconfig.build.json',
    'packages/sdk/tsconfig.json',
  ].includes(filePath);
}

function getNextPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/u.exec(version);

  if (!match) {
    throw new Error(
      `SDK package version "${version}" is not a simple semantic version.`
    );
  }

  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

function appendGithubOutput(output) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  const lines = [];
  for (const [key, value] of Object.entries(output)) {
    const serialized = String(value);
    if (serialized.includes('\n')) {
      lines.push(`${key}<<SDK_VERSION_BUMP_OUTPUT`);
      lines.push(serialized);
      lines.push('SDK_VERSION_BUMP_OUTPUT');
    } else {
      lines.push(`${key}=${serialized}`);
    }
  }

  appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

function updatePackageVersion(nextVersion) {
  const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8');
  const nextRaw = raw.replace(
    /"version":\s*"[^"]+"/u,
    `"version": "${nextVersion}"`
  );

  if (nextRaw === raw) {
    throw new Error(`Unable to update ${PACKAGE_JSON_PATH} version field.`);
  }

  writeFileSync(PACKAGE_JSON_PATH, nextRaw);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const changedFiles = getChangedFiles(args);
  const releaseFiles = changedFiles.filter(isReleaseImpactingSdkPath).sort();
  const currentPackage = readPackageJsonAt('WORKTREE');
  const basePackage = args.base ? readPackageJsonAt(args.base) : currentPackage;
  const currentVersion = currentPackage.version;
  const baseVersion = basePackage.version;
  const versionChanged = currentVersion !== baseVersion;
  const releaseChanges = releaseFiles.length > 0;
  const needsBump = releaseChanges && !versionChanged;
  const nextVersion = needsBump
    ? getNextPatchVersion(currentVersion)
    : currentVersion;

  console.log(`SDK release-impacting files: ${releaseFiles.length}`);
  for (const filePath of releaseFiles) {
    console.log(`- ${filePath}`);
  }
  console.log(`SDK version: ${baseVersion} -> ${currentVersion}`);

  appendGithubOutput({
    base_version: baseVersion,
    changed_files: releaseFiles.join('\n'),
    current_version: currentVersion,
    needs_bump: String(needsBump),
    next_version: nextVersion,
    release_changes: String(releaseChanges),
    version_changed: String(versionChanged),
  });

  if (args.mode === 'bump' && needsBump) {
    updatePackageVersion(nextVersion);
    console.log(`Bumped SDK package version to ${nextVersion}.`);
    return;
  }

  if (args.mode === 'check' && needsBump) {
    console.error(
      [
        '::error::Release-impacting packages/sdk files changed without a ',
        'packages/sdk/package.json version bump.',
      ].join('')
    );
    console.error(`Expected version bump: ${currentVersion} -> ${nextVersion}`);
    process.exitCode = 1;
  }
}

main();
