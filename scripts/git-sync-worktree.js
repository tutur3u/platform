const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

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

function createTemporaryWorktree({
  baseRef,
  git,
  makeTempDir,
  removeDir,
  tempRoot,
}) {
  const worktreePath = makeTempDir(path.join(tempRoot, 'tuturuuu-git-sync-'));

  try {
    git.run(['worktree', 'add', '--detach', worktreePath, baseRef]);
  } catch (error) {
    removeDir(worktreePath, { force: true, recursive: true });
    throw new Error(
      `Failed to create git-sync temporary worktree from ${baseRef}: ${error.message}`
    );
  }

  return {
    path: worktreePath,
    remove() {
      try {
        git.run(['worktree', 'remove', '--force', worktreePath]);
      } finally {
        removeDir(worktreePath, { force: true, recursive: true });
      }
    },
  };
}

module.exports = {
  createGit,
  createTemporaryWorktree,
  getDefaultTempRoot: tmpdir,
  makeTempDir: mkdtempSync,
  removeDir: rmSync,
};
