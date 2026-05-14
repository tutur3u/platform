#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

const DEFAULT_REMOTE = 'origin';
const MAIN_BRANCH = 'main';
const TARGET_BRANCHES = ['staging', 'production'];

function shortSha(sha) {
  return sha.slice(0, 12);
}

function createGit(execFile, cwd) {
  function run(args, options = {}) {
    return execFile('git', args, {
      cwd,
      encoding: options.encoding,
      stdio: options.stdio ?? 'inherit',
    });
  }

  return {
    read(args) {
      return String(run(args, { encoding: 'utf8', stdio: 'pipe' })).trim();
    },
    run,
    test(args) {
      try {
        run(args, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
  };
}

function assertCleanWorktree(status) {
  if (!status) {
    return;
  }

  throw new Error(
    [
      'git-sync requires a clean worktree before switching release branches.',
      'Commit, stash, or remove these changes first:',
      status,
    ].join('\n')
  );
}

function ensureLocalBranch(git, remote, branch) {
  if (git.test(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) {
    return;
  }

  const remoteRef = `refs/remotes/${remote}/${branch}`;
  if (!git.test(['show-ref', '--verify', '--quiet', remoteRef])) {
    throw new Error(
      `Missing local branch ${branch} and remote branch ${remote}/${branch}.`
    );
  }

  git.run(['branch', '--track', branch, `${remote}/${branch}`]);
}

function checkoutAndPull(git, remote, branch) {
  git.run(['checkout', branch]);
  git.run(['pull', '--ff-only', remote, branch]);
}

function assertCanFastForwardToMain(git, branch, mainSha) {
  if (git.test(['merge-base', '--is-ancestor', 'HEAD', mainSha])) {
    return;
  }

  throw new Error(
    `${branch} cannot fast-forward to ${MAIN_BRANCH} (${shortSha(
      mainSha
    )}) because it contains commits that are not in ${MAIN_BRANCH}. Reconcile it manually, then rerun bun git-sync.`
  );
}

function assertBranchAtSha(git, ref, expectedSha) {
  const actualSha = git.read(['rev-parse', ref]);
  if (actualSha !== expectedSha) {
    throw new Error(
      `${ref} is at ${shortSha(actualSha)}, expected ${shortSha(expectedSha)}.`
    );
  }
}

function restoreOriginalBranch(git, originalBranch, stderr) {
  let currentBranch = '';
  try {
    currentBranch = git.read(['branch', '--show-current']);
  } catch {
    return false;
  }

  if (!currentBranch || currentBranch === originalBranch) {
    return true;
  }

  try {
    git.run(['checkout', originalBranch]);
    return true;
  } catch (error) {
    stderr.write(
      `git-sync warning: synced branches, but could not restore ${originalBranch}: ${error.message}\n`
    );
    return false;
  }
}

function runGitSync({
  cwd = process.cwd(),
  execFile = execFileSync,
  remote = DEFAULT_REMOTE,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const git = createGit(execFile, cwd);
  const branches = [MAIN_BRANCH, ...TARGET_BRANCHES];
  const originalBranch = git.read(['branch', '--show-current']);

  if (!originalBranch) {
    throw new Error('git-sync cannot run from a detached HEAD checkout.');
  }

  assertCleanWorktree(git.read(['status', '--porcelain=v1']));

  let result;
  try {
    stdout.write(`Fetching ${remote}...\n`);
    git.run(['fetch', '--prune', remote]);

    for (const branch of branches) {
      ensureLocalBranch(git, remote, branch);
    }

    stdout.write(`Synchronizing ${MAIN_BRANCH}...\n`);
    checkoutAndPull(git, remote, MAIN_BRANCH);
    const mainSha = git.read(['rev-parse', MAIN_BRANCH]);
    git.run(['push', remote, MAIN_BRANCH]);
    git.run(['pull', '--ff-only', remote, MAIN_BRANCH]);

    for (const branch of TARGET_BRANCHES) {
      stdout.write(`Fast-forwarding ${branch} to ${shortSha(mainSha)}...\n`);
      checkoutAndPull(git, remote, branch);
      assertCanFastForwardToMain(git, branch, mainSha);
      git.run(['merge', '--ff-only', mainSha]);
      assertBranchAtSha(git, 'HEAD', mainSha);
      git.run(['push', remote, branch]);
      git.run(['pull', '--ff-only', remote, branch]);
    }

    git.run(['fetch', '--prune', remote]);
    for (const branch of branches) {
      assertBranchAtSha(git, branch, mainSha);
      assertBranchAtSha(git, `${remote}/${branch}`, mainSha);
    }

    result = { branches, mainSha, originalBranch, remote };
  } finally {
    if (originalBranch) {
      restoreOriginalBranch(git, originalBranch, stderr);
    }
  }

  stdout.write(
    `Synced ${branches.join(', ')} to ${shortSha(result.mainSha)} on ${remote}.\n`
  );

  return result;
}

function main() {
  try {
    runGitSync();
  } catch (error) {
    process.stderr.write(`git-sync failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  assertCleanWorktree,
  createGit,
  ensureLocalBranch,
  runGitSync,
  shortSha,
};

if (require.main === module) {
  main();
}
