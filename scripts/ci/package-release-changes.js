const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const {
  readJson,
  getPublishableWorkspacePackages,
} = require('./package-release-workspaces.js');

function runGitDiff({ baseRef, headRef, repoRoot }) {
  let result = spawnSync('git', ['diff', '--name-only', baseRef, headRef], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0 && /bad object/u.test(result.stderr)) {
    spawnSync('git', ['fetch', '--no-tags', '--depth=1', 'origin', baseRef], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    result = spawnSync('git', ['diff', '--name-only', baseRef, headRef], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }

  if (result.status !== 0) {
    throw new Error(
      `Unable to resolve changed files between ${baseRef} and ${headRef}: ` +
        result.stderr.trim()
    );
  }

  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function getChangedFilesFromEventPayload(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) return [];

  const event = readJson(eventPath);
  const changedFiles = new Set();

  for (const commit of event.commits ?? []) {
    for (const field of ['added', 'modified', 'removed']) {
      for (const changedFile of commit[field] ?? []) {
        changedFiles.add(changedFile);
      }
    }
  }

  return [...changedFiles].sort();
}

function getBeforeRefFromEventPayload(eventPath) {
  if (!eventPath || !fs.existsSync(eventPath)) return null;

  const event = readJson(eventPath);

  return typeof event.before === 'string' && !/^0+$/u.test(event.before)
    ? event.before
    : null;
}

function getChangedFiles({
  env = process.env,
  headRef = env.GITHUB_SHA || 'HEAD',
  repoRoot,
}) {
  const eventChangedFiles = getChangedFilesFromEventPayload(
    env.GITHUB_EVENT_PATH
  );

  if (eventChangedFiles.length > 0) {
    return eventChangedFiles;
  }

  const beforeRef =
    env.GITHUB_EVENT_BEFORE ??
    getBeforeRefFromEventPayload(env.GITHUB_EVENT_PATH);

  if (beforeRef && !/^0+$/u.test(beforeRef)) {
    return runGitDiff({
      baseRef: beforeRef,
      headRef,
      repoRoot,
    });
  }

  return runGitDiff({
    baseRef: 'HEAD^',
    headRef,
    repoRoot,
  });
}

function getLatestCommitChangedFiles({
  headRef = process.env.GITHUB_SHA || 'HEAD',
  repoRoot,
}) {
  return runGitDiff({
    baseRef: 'HEAD^',
    headRef,
    repoRoot,
  });
}

function getChangedPublishablePackages({ changedFiles, repoRoot }) {
  const publishablePackages = getPublishableWorkspacePackages(repoRoot);
  const publishableByPackageJsonPath = new Map(
    [...publishablePackages.values()].map((packageInfo) => [
      `${packageInfo.packageDir}/package.json`,
      packageInfo,
    ])
  );
  const changedPackages = new Map();

  for (const changedFile of changedFiles) {
    const packageInfo = publishableByPackageJsonPath.get(changedFile);

    if (packageInfo) {
      changedPackages.set(packageInfo.packageDir, packageInfo);
    }
  }

  return [...changedPackages.values()].sort((left, right) =>
    left.packageDir.localeCompare(right.packageDir)
  );
}

module.exports = {
  runGitDiff,
  getChangedFilesFromEventPayload,
  getBeforeRefFromEventPayload,
  getChangedFiles,
  getLatestCommitChangedFiles,
  getChangedPublishablePackages,
};
