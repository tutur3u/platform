#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

const DEFAULT_REMOTE = 'origin';
const MAIN_BRANCH = 'main';
const TARGET_BRANCHES = ['staging', 'production'];
const SYNC_BRANCHES = [MAIN_BRANCH, ...TARGET_BRANCHES];
const SYNC_BRANCH_SET = new Set(SYNC_BRANCHES);
const USAGE = `Usage: bun git-sync [options]

Fast-forward release branches to the current main commit.

Options:
  --only-branch <branch>  Sync only main, staging, or production. Can be repeated or comma-separated.
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
  let push = true;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      help = true;
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
    help,
    push,
    selectedBranches: normalizeBranchSelection(onlyBranches),
  };
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

function writeLine(stdout, message = '') {
  stdout.write(`${message}\n`);
}

function writePlan(stdout, { push, remote, selectedBranches }) {
  writeLine(stdout, 'Git sync');
  writeLine(stdout, `  Remote: ${remote}`);
  writeLine(stdout, `  Branches: ${selectedBranches.join(', ')}`);
  writeLine(stdout, `  Push: ${push ? 'enabled' : 'disabled (--no-push)'}`);
  writeLine(stdout);
}

function writeStep(stdout, message) {
  writeLine(stdout, `> ${message}`);
}

function writeSuccess(stdout, result) {
  writeLine(stdout);
  writeLine(stdout, 'Done');
  writeLine(stdout, `  Commit: ${shortSha(result.mainSha)}`);
  writeLine(stdout, `  Local: ${result.selectedBranches.join(', ')}`);
  writeLine(
    stdout,
    `  Pushed: ${
      result.pushedBranches.length > 0
        ? result.pushedBranches.join(', ')
        : 'none'
    }`
  );
  writeLine(stdout, `  Restored branch: ${result.originalBranch}`);
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
  push = true,
  remote = DEFAULT_REMOTE,
  selectedBranches = SYNC_BRANCHES,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const git = createGit(execFile, cwd);
  const branches = normalizeBranchSelection(selectedBranches);
  const targetBranches = branches.filter((branch) => branch !== MAIN_BRANCH);
  const branchesToPrepare = normalizeBranchSelection([
    MAIN_BRANCH,
    ...targetBranches,
  ]);
  const originalBranch = git.read(['branch', '--show-current']);

  if (!originalBranch) {
    throw new Error('git-sync cannot run from a detached HEAD checkout.');
  }

  assertCleanWorktree(git.read(['status', '--porcelain=v1']));
  writePlan(stdout, { push, remote, selectedBranches: branches });

  let result;
  try {
    writeStep(stdout, `Fetch ${remote}`);
    git.run(['fetch', '--prune', remote]);

    for (const branch of branchesToPrepare) {
      ensureLocalBranch(git, remote, branch);
    }

    writeStep(stdout, `Refresh ${MAIN_BRANCH}`);
    checkoutAndPull(git, remote, MAIN_BRANCH);
    const mainSha = git.read(['rev-parse', MAIN_BRANCH]);

    if (branches.includes(MAIN_BRANCH) && push) {
      writeStep(stdout, `Push ${MAIN_BRANCH}`);
      git.run(['push', remote, MAIN_BRANCH]);
      git.run(['pull', '--ff-only', remote, MAIN_BRANCH]);
    }

    for (const branch of TARGET_BRANCHES) {
      if (!targetBranches.includes(branch)) {
        continue;
      }

      writeStep(stdout, `Fast-forward ${branch} to ${shortSha(mainSha)}`);
      checkoutAndPull(git, remote, branch);
      assertCanFastForwardToMain(git, branch, mainSha);
      git.run(['merge', '--ff-only', mainSha]);
      assertBranchAtSha(git, 'HEAD', mainSha);

      if (push) {
        writeStep(stdout, `Push ${branch}`);
        git.run(['push', remote, branch]);
        git.run(['pull', '--ff-only', remote, branch]);
      }
    }

    if (push) {
      writeStep(stdout, 'Verify local and remote refs');
      git.run(['fetch', '--prune', remote]);
    } else {
      writeStep(stdout, 'Verify local refs');
    }

    for (const branch of branches) {
      assertBranchAtSha(git, branch, mainSha);
      if (push) {
        assertBranchAtSha(git, `${remote}/${branch}`, mainSha);
      }
    }

    result = {
      mainSha,
      originalBranch,
      pushedBranches: push ? branches : [],
      remote,
      selectedBranches: branches,
    };
  } finally {
    if (originalBranch) {
      restoreOriginalBranch(git, originalBranch, stderr);
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
  assertCleanWorktree,
  createGit,
  ensureLocalBranch,
  normalizeBranchSelection,
  parseArgs,
  runGitSync,
  shortSha,
  USAGE,
};

if (require.main === module) {
  main();
}
