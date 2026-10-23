const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Rebuildable outputs only. `.wrangler` (local D1/KV state), Playwright
// evidence, iOS Pods and node_modules are intentionally excluded. A `*`
// matches one directory level. Every match must also be git-ignored and
// contain no tracked files (apps/docs/build is tracked documentation).
const ARTIFACT_RULES = [
  {
    category: 'turbo',
    patterns: ['.turbo', 'apps/*/.turbo', 'packages/*/.turbo'],
  },
  { category: 'next', patterns: ['apps/*/.next'] },
  { category: 'open-next', patterns: ['apps/*/.open-next'] },
  { category: 'dist', patterns: ['apps/*/dist', 'packages/*/dist'] },
  { category: 'build', patterns: ['apps/*/build', 'packages/*/build'] },
  {
    category: 'dart-tool-build',
    patterns: [
      'apps/*/.dart_tool/build',
      'apps/*/.dart_tool/flutter_build',
      'apps/*/.dart_tool/hooks_runner',
    ],
  },
];

function git(cwd, args, execFile = execFileSync) {
  // --no-optional-locks keeps status from refreshing (writing) the index of
  // worktrees this tool only inspects.
  return execFile('git', ['--no-optional-locks', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
}

function gitSucceeds(cwd, args, execFile = execFileSync) {
  try {
    git(cwd, args, execFile);
    return true;
  } catch {
    return false;
  }
}

function parseWorktreeList(output) {
  const worktrees = [];
  let current = null;

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length) };
      worktrees.push(current);
    } else if (!current || line === '') {
    } else if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//u, '');
    } else if (line === 'detached') current.detached = true;
    else if (line === 'bare') current.bare = true;
    else if (line.startsWith('locked')) current.locked = true;
    else if (line.startsWith('prunable')) current.prunable = true;
  }

  return worktrees.map((worktree, index) => ({
    ...worktree,
    primary: index === 0,
  }));
}

function listWorktrees(repoDir, execFile = execFileSync) {
  return parseWorktreeList(
    git(repoDir, ['worktree', 'list', '--porcelain'], execFile)
  );
}

function readHolds(holdsFile, fsImpl = fs, { optional = false } = {}) {
  if (!holdsFile) throw new Error('Holds file path must not be empty.');

  try {
    return fsImpl
      .readFileSync(holdsFile, 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*$/u, '').trim())
      .filter((line) => line.startsWith('/'));
  } catch (error) {
    if (optional && error.code === 'ENOENT') return [];
    throw new Error(`Cannot read holds file ${holdsFile}: ${error.message}`);
  }
}

function canonicalPath(input) {
  const absolute = path.resolve(input);
  try {
    return fs.realpathSync(absolute);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(canonicalPath(parent), path.basename(absolute));
  }
}

function isInside(child, parent) {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

// A hold protects its path, everything under it, and everything above it.
// Globs are matched conservatively by their literal prefix.
function isHeld(worktreePath, holds) {
  worktreePath = canonicalPath(worktreePath);
  return holds.some((hold) => {
    const wildcard = hold.indexOf('*');
    if (wildcard === -1) {
      hold = canonicalPath(hold);
      return isInside(hold, worktreePath) || isInside(worktreePath, hold);
    }
    const literal = hold.slice(0, wildcard);
    const prefix = canonicalPath(literal) + (literal.endsWith('/') ? '/' : '');
    return (
      worktreePath.startsWith(prefix) || prefix.startsWith(`${worktreePath}/`)
    );
  });
}

function expandPattern(root, pattern, fsImpl = fs) {
  let matches = [root];

  for (const segment of pattern.split('/')) {
    const next = [];

    for (const base of matches) {
      if (segment !== '*') {
        const target = path.join(base, segment);
        if (!fsImpl.lstatSync(target, { throwIfNoEntry: false })?.isDirectory())
          continue;
        next.push(target);
        continue;
      }

      try {
        for (const entry of fsImpl.readdirSync(base, { withFileTypes: true })) {
          if (entry.isDirectory()) next.push(path.join(base, entry.name));
        }
      } catch {
        // Missing parents simply produce no matches.
      }
    }

    matches = next;
  }

  return matches.filter((candidate) => {
    try {
      return fsImpl.lstatSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Returns ignored, untracked, non-symlink artifact directories in a worktree. */
function findArtifactDirs(
  worktreePath,
  { execFile = execFileSync, fsImpl = fs, skipped = [] } = {}
) {
  const found = [];

  for (const rule of ARTIFACT_RULES) {
    for (const pattern of rule.patterns) {
      for (const dir of expandPattern(worktreePath, pattern, fsImpl)) {
        found.push({ category: rule.category, path: dir });
      }
    }
  }

  if (found.length === 0) return [];

  const relative = found.map((entry) =>
    path.relative(worktreePath, entry.path)
  );
  let ignored = new Set();
  try {
    ignored = new Set(
      git(worktreePath, ['check-ignore', '--', ...relative], execFile)
        .split('\n')
        .filter(Boolean)
    );
  } catch (error) {
    if (error.status !== 1) {
      skipped.push({ path: worktreePath, reason: 'check-ignore-failed' });
      return [];
    }
  }

  const tracked = new Set(
    git(worktreePath, ['ls-files', '-z', '--', ...relative], execFile)
      .split('\0')
      .filter(Boolean)
  );

  return found.filter((_entry, index) => {
    const rel = relative[index];
    if (!ignored.has(rel)) return false;
    for (const file of tracked) {
      if (file === rel || file.startsWith(`${rel}/`)) return false;
    }
    return true;
  });
}

function newestMtimeMs(
  dir,
  fsImpl = fs,
  { maxDepth = 32, maxEntries = 10000 } = {}
) {
  let newest = 0;
  let entries = 0;
  function visit(target, depth) {
    if (++entries > maxEntries) throw new Error('entry cap');
    const stat = fsImpl.lstatSync(target);
    newest = Math.max(newest, stat.mtimeMs);
    if (!stat.isDirectory()) return;
    const handle = fsImpl.opendirSync(target);
    try {
      let entry = handle.readSync();
      while (entry !== null) {
        if (depth >= maxDepth) throw new Error('depth cap');
        visit(path.join(target, entry.name), depth + 1);
        entry = handle.readSync();
      }
    } finally {
      handle.closeSync();
    }
  }
  try {
    visit(dir, 0);
    return newest;
  } catch {
    return Infinity;
  }
}

function inspectWorktree(
  worktree,
  { baseRef, execFile = execFileSync, holds = [] }
) {
  if (worktree.prunable || !fs.existsSync(worktree.path)) {
    return { ...worktree, missing: true };
  }

  const gitDir = git(
    worktree.path,
    ['rev-parse', '--absolute-git-dir'],
    execFile
  ).trim();
  // Activity = newest of the index and HEAD reflog, read before status runs.
  let activityMtimeMs = 0;
  for (const file of ['index', path.join('logs', 'HEAD')]) {
    try {
      activityMtimeMs = Math.max(
        activityMtimeMs,
        fs.statSync(path.join(gitDir, file)).mtimeMs
      );
    } catch {
      // Missing files carry no activity signal.
    }
  }
  const status = git(worktree.path, ['status', '--porcelain=v1'], execFile);

  return {
    ...worktree,
    dirtyPaths: status.split('\n').filter(Boolean).length,
    activityMtimeMs,
    held: isHeld(worktree.path, holds),
    merged: gitSucceeds(
      worktree.path,
      ['merge-base', '--is-ancestor', 'HEAD', baseRef],
      execFile
    ),
  };
}

module.exports = {
  ARTIFACT_RULES,
  findArtifactDirs,
  git,
  inspectWorktree,
  isHeld,
  isInside,
  listWorktrees,
  newestMtimeMs,
  parseWorktreeList,
  readHolds,
};
