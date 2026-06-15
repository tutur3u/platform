#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const {
  createGit,
  createTemporaryWorktree,
  getDefaultTempRoot,
  makeTempDir: defaultMakeTempDir,
  removeDir: defaultRemoveDir,
} = require('./git-sync-worktree.js');

const DEFAULT_REMOTE = 'origin';
const MAIN_BRANCH = 'main';
const RETIRED_BRANCHES = new Set(['staging']);
const TARGET_BRANCHES = ['production'];
const SYNC_BRANCHES = [MAIN_BRANCH, ...TARGET_BRANCHES];
const SYNC_BRANCH_SET = new Set(SYNC_BRANCHES);
const USAGE = `Usage: bun git-sync [options]

Fast-forward release branches through a temporary worktree.

Options:
  --only-branch <branch>  Sync only main or production. Can be repeated or comma-separated.
  -c, --current-branch    Sync selected branches to the current checkout's HEAD.
  --no-push               Update local branches only and skip all pushes.
  -h, --help              Show this help message.
`;

function shortSha(sha) {
  return sha.slice(0, 12);
}

function normalizeBranchSelection(branches) {
  const selectedBranches = branches?.length ? branches : SYNC_BRANCHES;
  const normalized = [];

  for (const branch of selectedBranches) {
    if (RETIRED_BRANCHES.has(branch)) {
      throw new Error(
        `Branch "${branch}" is retired. Use main for staging-environment CI and production for release sync.`
      );
    }

    if (!SYNC_BRANCH_SET.has(branch)) {
      throw new Error(
        `Unsupported branch "${branch}". Expected one of: ${SYNC_BRANCHES.join(', ')}.`
      );
    }

    if (!normalized.includes(branch)) {
      normalized.push(branch);
    }
  }

  return normalized;
}

function parseOnlyBranchValue(value) {
  if (!value || value.startsWith('--')) {
    throw new Error('Missing value after --only-branch.');
  }

  const branches = value
    .split(',')
    .map((branch) => branch.trim())
    .filter(Boolean);

  if (branches.length === 0) {
    throw new Error('Missing value after --only-branch.');
  }

  return branches;
}

function parseArgs(argv = process.argv.slice(2)) {
  const onlyBranches = [];
  let currentBranch = false;
  let push = true;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    if (arg === '-c' || arg === '--current-branch') {
      currentBranch = true;
      continue;
    }

    if (arg === '--no-push') {
      push = false;
      continue;
    }

    if (arg === '--only-branch') {
      onlyBranches.push(...parseOnlyBranchValue(argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg.startsWith('--only-branch=')) {
      onlyBranches.push(
        ...parseOnlyBranchValue(arg.slice('--only-branch='.length))
      );
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  return {
    currentBranch,
    help,
    push,
    selectedBranches: normalizeBranchSelection(onlyBranches),
  };
}

function writeLine(stdout, message = '') {
  stdout.write(`${message}\n`);
}

function writePlan(stdout, { push, remote, selectedBranches, source }) {
  writeLine(stdout, 'Git sync');
  writeLine(stdout, `  Remote: ${remote}`);
  writeLine(stdout, `  Source: ${source}`);
  writeLine(stdout, `  Branches: ${selectedBranches.join(', ')}`);
  writeLine(stdout, '  Worktree: temporary detached worktree');
  writeLine(stdout, `  Push: ${push ? 'enabled' : 'disabled (--no-push)'}`);
  writeLine(stdout);
}

function writeStep(stdout, message) {
  writeLine(stdout, `> ${message}`);
}

function writeSuccess(stdout, result) {
  writeLine(stdout);
  writeLine(stdout, 'Done');
  writeLine(stdout, `  Commit: ${shortSha(result.sourceSha)}`);
  writeLine(stdout, `  Local: ${result.selectedBranches.join(', ')}`);
  writeLine(
    stdout,
    `  Pushed: ${
      result.pushedBranches.length > 0
        ? result.pushedBranches.join(', ')
        : 'none'
    }`
  );
  writeLine(stdout, `  Current checkout: ${result.originalBranch} (untouched)`);
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

function isAncestor(git, baseRef, tipRef) {
  return git.test(['merge-base', '--is-ancestor', baseRef, tipRef]);
}

function assertCanFastForwardToSource(
  git,
  branch,
  branchSha,
  sourceSha,
  source
) {
  if (isAncestor(git, branchSha, sourceSha)) {
    return;
  }

  throw new Error(
    `${branch} cannot fast-forward to ${source} (${shortSha(
      sourceSha
    )}) because it contains commits that are not in ${source}. Reconcile it manually, then rerun bun git-sync.`
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

function updateLocalBranch(git, branch, targetSha) {
  const currentSha = git.read(['rev-parse', branch]);
  if (currentSha === targetSha) {
    return;
  }

  try {
    git.run(['branch', '--force', branch, targetSha]);
  } catch (error) {
    throw new Error(
      [
        `Cannot update ${branch} to ${shortSha(targetSha)} from the git-sync worktree.`,
        'Git reports that the branch is checked out or locked by another worktree.',
        `Switch that worktree away from ${branch} or update it manually, then rerun bun git-sync.`,
        `Original error: ${error.message}`,
      ].join(' ')
    );
  }

  assertBranchAtSha(git, branch, targetSha);
}

function refreshLocalBranchFromRemote(git, remote, branch) {
  ensureLocalBranch(git, remote, branch);

  const remoteBranch = `${remote}/${branch}`;
  const localSha = git.read(['rev-parse', branch]);
  const remoteSha = git.read(['rev-parse', remoteBranch]);

  if (localSha === remoteSha) {
    return localSha;
  }

  if (isAncestor(git, localSha, remoteSha)) {
    updateLocalBranch(git, branch, remoteSha);
    return remoteSha;
  }

  if (isAncestor(git, remoteSha, localSha)) {
    return localSha;
  }

  throw new Error(
    `${branch} and ${remoteBranch} have diverged. Reconcile them manually, then rerun bun git-sync.`
  );
}

function getCurrentBranchSource(git, originalBranch) {
  if (originalBranch === 'detached HEAD') {
    throw new Error(
      'Cannot use --current-branch from detached HEAD. Check out a branch, then rerun bun git-sync --current-branch.'
    );
  }

  const sourceSha = git.read(['rev-parse', 'HEAD']);

  return {
    baseRef: sourceSha,
    source: originalBranch,
    sourceSha,
    sourceSummary: `${originalBranch}@${shortSha(sourceSha)}`,
  };
}

function getMainSource(remote) {
  return {
    baseRef: `${remote}/${MAIN_BRANCH}`,
    source: MAIN_BRANCH,
    sourceSha: null,
    sourceSummary: `latest ${remote}/${MAIN_BRANCH}`,
  };
}

function refreshTargetBranch(git, remote, branch, source) {
  if (branch === source.source) {
    assertBranchAtSha(git, branch, source.sourceSha);
    return source.sourceSha;
  }

  return refreshLocalBranchFromRemote(git, remote, branch);
}

function runGitSync({
  cwd = process.cwd(),
  currentBranch = false,
  execFile = execFileSync,
  makeTempDir = defaultMakeTempDir,
  removeDir = defaultRemoveDir,
  push = true,
  remote = DEFAULT_REMOTE,
  selectedBranches = SYNC_BRANCHES,
  stdout = process.stdout,
  stderr = process.stderr,
  tempRoot = getDefaultTempRoot(),
} = {}) {
  const git = createGit(execFile, cwd);
  const branches = normalizeBranchSelection(selectedBranches);
  const originalBranch =
    git.read(['branch', '--show-current']) || 'detached HEAD';
  const source = currentBranch
    ? getCurrentBranchSource(git, originalBranch)
    : getMainSource(remote);
  const targetBranches = currentBranch
    ? branches
    : branches.filter((branch) => branch !== MAIN_BRANCH);
  const syncTargets = currentBranch ? SYNC_BRANCHES : TARGET_BRANCHES;

  writePlan(stdout, {
    push,
    remote,
    selectedBranches: branches,
    source: source.sourceSummary,
  });

  let result;
  let worktree;
  try {
    writeStep(stdout, `Fetch ${remote}`);
    git.run(['fetch', '--prune', remote]);

    worktree = createTemporaryWorktree({
      baseRef: source.baseRef,
      git,
      makeTempDir,
      removeDir,
      tempRoot,
    });
    const worktreeGit = createGit(execFile, worktree.path);

    if (!source.sourceSha) {
      writeStep(stdout, `Refresh ${MAIN_BRANCH}`);
      source.sourceSha = refreshLocalBranchFromRemote(
        worktreeGit,
        remote,
        MAIN_BRANCH
      );
    }

    if (!currentBranch && branches.includes(MAIN_BRANCH) && push) {
      writeStep(stdout, `Push ${MAIN_BRANCH}`);
      worktreeGit.run(['push', remote, MAIN_BRANCH]);
    }

    for (const branch of syncTargets) {
      if (!targetBranches.includes(branch)) {
        continue;
      }

      writeStep(
        stdout,
        `Fast-forward ${branch} to ${shortSha(source.sourceSha)}`
      );
      const branchSha = refreshTargetBranch(
        worktreeGit,
        remote,
        branch,
        source
      );
      assertCanFastForwardToSource(
        worktreeGit,
        branch,
        branchSha,
        source.sourceSha,
        source.source
      );
      updateLocalBranch(worktreeGit, branch, source.sourceSha);

      if (push) {
        writeStep(stdout, `Push ${branch}`);
        worktreeGit.run(['push', remote, branch]);
      }
    }

    if (push) {
      writeStep(stdout, 'Verify local and remote refs');
      worktreeGit.run(['fetch', '--prune', remote]);
    } else {
      writeStep(stdout, 'Verify local refs');
    }

    for (const branch of branches) {
      assertBranchAtSha(worktreeGit, branch, source.sourceSha);
      if (push) {
        assertBranchAtSha(worktreeGit, `${remote}/${branch}`, source.sourceSha);
      }
    }

    result = {
      mainSha: source.sourceSha,
      originalBranch,
      pushedBranches: push ? branches : [],
      remote,
      selectedBranches: branches,
      sourceBranch: source.source,
      sourceSha: source.sourceSha,
    };
  } finally {
    if (worktree) {
      try {
        worktree.remove();
      } catch (error) {
        stderr.write(
          `git-sync warning: could not remove temporary worktree ${worktree.path}: ${error.message}\n`
        );
      }
    }
  }

  writeSuccess(stdout, result);

  return result;
}

function main() {
  try {
    const options = parseArgs();

    if (options.help) {
      process.stdout.write(USAGE);
      return;
    }

    runGitSync(options);
  } catch (error) {
    process.stderr.write(`git-sync failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  createGit,
  createTemporaryWorktree,
  ensureLocalBranch,
  normalizeBranchSelection,
  parseArgs,
  refreshLocalBranchFromRemote,
  runGitSync,
  shortSha,
  USAGE,
};

if (require.main === module) {
  main();
}
