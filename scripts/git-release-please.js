#!/usr/bin/env node

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_REMOTE = 'origin';
const DEFAULT_TARGET_BRANCH = 'production';
const RELEASE_BRANCH_PREFIX = 'release-please--branches--';
const RELEASE_NOTES_SUFFIX = '--release-notes';
const PLATFORM_RELEASE_FILES = [
  'packages/utils/src/platform-release.ts',
  'packages/utils/src/platform-release.test.ts',
];

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    baseBranch: DEFAULT_BASE_BRANCH,
    fetch: true,
    format: true,
    remote: DEFAULT_REMOTE,
    targetBranch: DEFAULT_TARGET_BRANCH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--base') {
      options.baseBranch = next;
      index += 1;
      continue;
    }

    if (arg === '--remote') {
      options.remote = next;
      index += 1;
      continue;
    }

    if (arg === '--target-branch') {
      options.targetBranch = next;
      index += 1;
      continue;
    }

    if (arg === '--skip-fetch') {
      options.fetch = false;
      continue;
    }

    if (arg === '--skip-format') {
      options.format = false;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'string' && value.length === 0) {
      throw new Error(`Missing value for ${key}.`);
    }
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: options.stdio ?? 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.`
    );
  }

  return result.status ?? 1;
}

function output(command, args) {
  return execFileSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
}

function getGitPath(name) {
  return output('git', ['rev-parse', '--git-path', name]);
}

function isMergeInProgress() {
  return fs.existsSync(path.join(ROOT_DIR, getGitPath('MERGE_HEAD')));
}

function getStatusPorcelain() {
  return output('git', ['status', '--porcelain']);
}

function requireCleanWorktree() {
  const status = getStatusPorcelain();

  if (status) {
    throw new Error(
      [
        'Working tree must be clean before merging a release-please branch.',
        status,
      ].join('\n')
    );
  }
}

function requireBranch(branchName) {
  const currentBranch = output('git', ['branch', '--show-current']);

  if (currentBranch !== branchName) {
    throw new Error(
      `Run this command from ${branchName}; current branch is ${currentBranch || '(detached HEAD)'}.`
    );
  }
}

function fetchReleasePleaseBranches(remote) {
  run('git', [
    'fetch',
    remote,
    `+refs/heads/${RELEASE_BRANCH_PREFIX}*:refs/remotes/${remote}/${RELEASE_BRANCH_PREFIX}*`,
  ]);
}

function listReleasePleaseBranches(remote) {
  const refs = output('git', [
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)',
    `refs/remotes/${remote}/${RELEASE_BRANCH_PREFIX}*`,
  ]);

  return refs
    .split(/\r?\n/)
    .map((ref) => ref.trim())
    .filter(Boolean)
    .filter((ref) => !ref.endsWith(RELEASE_NOTES_SUFFIX));
}

function selectReleasePleaseBranch(branches, { remote, targetBranch }) {
  const expected = `${remote}/${RELEASE_BRANCH_PREFIX}${targetBranch}`;
  const matchingBranch = branches.find((branch) => branch === expected);

  if (matchingBranch) {
    return matchingBranch;
  }

  return branches[0] ?? null;
}

function isAncestor(ref) {
  return (
    spawnSync('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], {
      cwd: ROOT_DIR,
      stdio: 'ignore',
    }).status === 0
  );
}

function getUnresolvedConflictFiles() {
  const files = output('git', ['diff', '--name-only', '--diff-filter=U']);

  return files ? files.split(/\r?\n/).filter(Boolean) : [];
}

function syncPlatformReleaseVersion() {
  run('bun', ['release:sync-platform-version']);
  run('git', ['add', ...PLATFORM_RELEASE_FILES]);
}

function ensureNoUnresolvedConflicts() {
  const unresolvedFiles = getUnresolvedConflictFiles();

  if (unresolvedFiles.length > 0) {
    throw new Error(
      [
        'Release-please merge still has unresolved conflicts:',
        ...unresolvedFiles.map((file) => `- ${file}`),
      ].join('\n')
    );
  }
}

function mergeReleaseBranch(branch) {
  const status = run('git', ['merge', '--no-ff', '--no-commit', branch], {
    allowFailure: true,
  });

  if (status !== 0 && !isMergeInProgress()) {
    throw new Error(`Unable to start merge for ${branch}.`);
  }
}

function finalizeMerge({ format }) {
  syncPlatformReleaseVersion();
  ensureNoUnresolvedConflicts();

  if (format) {
    run('bun', ['ff']);
  }

  run('git', ['add', '--all']);
  run('git', ['commit', '--no-edit']);
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);

    if (isMergeInProgress()) {
      throw new Error(
        'A merge is already in progress. Finish or abort it before running bun git-release-please.'
      );
    }

    requireBranch(options.baseBranch);
    requireCleanWorktree();

    if (options.fetch) {
      fetchReleasePleaseBranches(options.remote);
    }

    const releaseBranch = selectReleasePleaseBranch(
      listReleasePleaseBranches(options.remote),
      options
    );

    if (!releaseBranch) {
      throw new Error(
        `No ${RELEASE_BRANCH_PREFIX} branch found on ${options.remote}.`
      );
    }

    if (isAncestor(releaseBranch)) {
      console.log(`${releaseBranch} is already merged into HEAD.`);
      return;
    }

    console.log(`Merging ${releaseBranch} into ${options.baseBranch}...`);
    mergeReleaseBranch(releaseBranch);
    finalizeMerge(options);
    console.log('Release-please merge is complete and ready for push.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  selectReleasePleaseBranch,
};
