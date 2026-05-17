const path = require('node:path');

const { runChecked, runCommand } = require('../docker-web/compose.js');
const { readWatchLock } = require('./deploy-watcher-lock-status.js');
const { SELF_WATCHED_FILES } = require('./deploy-watcher-watched-paths.js');
const { getWatchPaths, ROOT_DIR } = require('./paths.js');
const {
  DEFAULT_GIT_FAILURE_BACKOFF_MS,
  DEFAULT_STALE_GIT_INDEX_LOCK_MS,
  MAX_GIT_FAILURE_BACKOFF_MS,
} = require('./watcher-constants.js');

async function gitStdout(
  args,
  { cwd = ROOT_DIR, env, runCommand: run = runCommand } = {}
) {
  const { stdout = '' } = await runChecked('git', args, {
    cwd,
    env,
    runCommand: run,
    stdio: 'pipe',
  });

  return stdout;
}

function parseUpstreamRef(upstreamRef) {
  const ref = String(upstreamRef ?? '').trim();
  const slash = ref.indexOf('/');

  if (slash <= 0 || slash >= ref.length - 1) {
    throw new Error(`Invalid git upstream ref: ${upstreamRef}`);
  }

  const remote = ref.slice(0, slash);
  const branch = ref.slice(slash + 1);

  return {
    branch,
    remote,
    upstreamRef: ref,
  };
}

async function getTrackedUpstream({
  cwd = ROOT_DIR,
  env,
  runCommand: run = runCommand,
} = {}) {
  try {
    const out = await gitStdout(
      ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
      { cwd, env, runCommand: run }
    );

    return out.trim();
  } catch {
    return null;
  }
}

async function getCurrentBranchName({
  cwd = ROOT_DIR,
  env,
  runCommand: run = runCommand,
} = {}) {
  return (
    await gitStdout(['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
      env,
      runCommand: run,
    })
  ).trim();
}

const getCurrentBranch = getCurrentBranchName;

async function getRevision(
  rev,
  { cwd = ROOT_DIR, env, runCommand: run = runCommand } = {}
) {
  return (
    await gitStdout(['rev-parse', rev], { cwd, env, runCommand: run })
  ).trim();
}

async function getCommitMetadata(
  rev,
  { cwd = ROOT_DIR, env, runCommand: run = runCommand } = {}
) {
  const out = (
    await gitStdout(['log', '-1', '--format=%H%n%h%n%s%n%cI', rev], {
      cwd,
      env,
      runCommand: run,
    })
  ).trim();
  const [hash, shortHash, subject] = out.split('\n');

  return {
    hash: hash ?? '',
    shortHash: shortHash ?? '',
    subject: subject ?? '',
  };
}

async function checkoutRevision(
  hash,
  { cwd = ROOT_DIR, env, runCommand: run = runCommand } = {}
) {
  await runChecked('git', ['checkout', '--detach', hash], {
    cwd,
    env,
    runCommand: run,
    stdio: 'pipe',
  });
}

async function checkoutBranch(
  branch,
  { cwd = ROOT_DIR, env, runCommand: run = runCommand } = {}
) {
  await runChecked('git', ['checkout', branch], {
    cwd,
    env,
    runCommand: run,
    stdio: 'pipe',
  });
}

function getGitLockPathFromError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Unable to create '([^']+\.lock)'/u);

  return match?.[1] ?? null;
}

function getRecoverableGitLockKind(resolvedLockPath, rootDir = ROOT_DIR) {
  const gitDir = path.normalize(path.join(rootDir, '.git'));
  const relative = path.relative(gitDir, resolvedLockPath);

  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !relative.endsWith('.lock')
  ) {
    return null;
  }

  const normalized = path.normalize(relative);

  if (normalized === 'index.lock') {
    return 'index';
  }

  if (normalized === 'packed-refs.lock') {
    return 'packed-refs';
  }

  if (normalized.startsWith(`${path.normalize('refs')}${path.sep}`)) {
    return 'ref';
  }

  return null;
}

function formatGitLockKind(kind) {
  if (kind === 'index') {
    return 'git index lock';
  }

  if (kind === 'packed-refs') {
    return 'git packed-refs lock';
  }

  return 'git ref lock';
}

function removeStaleGitLock({
  error,
  fsImpl = require('node:fs'),
  log,
  now = () => Date.now(),
  rootDir = ROOT_DIR,
} = {}) {
  const lockPath = getGitLockPathFromError(error);

  if (!lockPath) {
    return false;
  }

  const resolved = path.normalize(
    path.isAbsolute(lockPath) ? lockPath : path.join(rootDir, lockPath)
  );
  const lockKind = getRecoverableGitLockKind(resolved, rootDir);

  if (!lockKind) {
    return false;
  }

  let stats;
  try {
    stats = fsImpl.statSync(resolved);
  } catch {
    return false;
  }

  const ageMs = now() - stats.mtimeMs;
  const lockLabel = formatGitLockKind(lockKind);

  if (ageMs < DEFAULT_STALE_GIT_INDEX_LOCK_MS) {
    log?.warn?.(
      `${lockLabel} at ${resolved} is only ${Math.round(ageMs / 1000)}s old; Leaving it in place.`
    );
    return false;
  }

  try {
    fsImpl.unlinkSync(resolved);
  } catch {
    return false;
  }

  log?.warn?.(
    `Removed stale ${lockLabel} at ${resolved} (${Math.round(ageMs / 1000)}s old).`
  );
  return true;
}

const removeStaleGitIndexLock = removeStaleGitLock;

async function runGitWithStaleLockRetry(
  args,
  {
    cwd = ROOT_DIR,
    env,
    fsImpl = require('node:fs'),
    log,
    now = () => Date.now(),
    rootDir = cwd,
    runCommand: run = runCommand,
  } = {}
) {
  try {
    await runChecked('git', args, {
      cwd,
      env,
      runCommand: run,
      stdio: 'pipe',
    });
  } catch (error) {
    if (
      removeStaleGitLock({
        error,
        fsImpl,
        log,
        now,
        rootDir,
      })
    ) {
      await runChecked('git', args, {
        cwd,
        env,
        runCommand: run,
        stdio: 'pipe',
      });
      return;
    }

    throw error;
  }
}

async function fetchTrackedBranch(
  target,
  {
    cwd = ROOT_DIR,
    env,
    fsImpl = require('node:fs'),
    log,
    now = () => Date.now(),
    runCommand: run = runCommand,
  } = {}
) {
  await runGitWithStaleLockRetry(
    ['fetch', target.remote, target.upstreamBranch],
    {
      cwd,
      env,
      fsImpl,
      log,
      now,
      rootDir: cwd,
      runCommand: run,
    }
  );
}

async function pullTrackedBranch(
  target,
  {
    cwd,
    env,
    fsImpl = require('node:fs'),
    log,
    now = () => Date.now(),
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const workDir = cwd ?? rootDir;
  const args = ['pull', '--ff-only', target.remote, target.upstreamBranch];

  await runGitWithStaleLockRetry(args, {
    cwd: workDir,
    env,
    fsImpl,
    log,
    now,
    rootDir: workDir,
    runCommand: run,
  });
}

async function listDirtyWorktreePaths({
  cwd = ROOT_DIR,
  env,
  runCommand: run = runCommand,
} = {}) {
  const { stdout = '' } = await runChecked('git', ['status', '--porcelain'], {
    cwd,
    env,
    runCommand: run,
    stdio: 'pipe',
  });

  const pathsOut = [];

  for (const line of stdout.split(/\r?\n/u)) {
    if (!line.trim()) {
      continue;
    }

    const body = line.slice(2).trimStart();

    if (!body) {
      continue;
    }

    if (body.includes(' -> ')) {
      const [from, to] = body.split(' -> ');
      pathsOut.push(from.trim(), to.trim());
      continue;
    }

    pathsOut.push(body.trim());
  }

  return pathsOut;
}

async function hasDirtyWorktree({
  cwd = ROOT_DIR,
  env,
  ignoredPaths = [],
  runCommand: run = runCommand,
} = {}) {
  const dirty = await listDirtyWorktreePaths({ cwd, env, runCommand: run });
  const ignored = new Set(ignoredPaths);

  return dirty.some((p) => !ignored.has(p));
}

async function listChangedFilesBetweenRevisions(
  from,
  to,
  { cwd = ROOT_DIR, env, pathSpecs = [], runCommand: run = runCommand } = {}
) {
  const args = ['diff', '--name-only', from, to];

  if (pathSpecs.length > 0) {
    args.push('--', ...pathSpecs);
  }

  const { stdout = '' } = await runChecked('git', args, {
    cwd,
    env,
    runCommand: run,
    stdio: 'pipe',
  });

  return stdout
    .split(/\r?\n/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function hasWatchedScriptChanges(
  from,
  to,
  {
    cwd = ROOT_DIR,
    env,
    relativePaths = SELF_WATCHED_FILES,
    runCommand: run = runCommand,
  } = {}
) {
  const changed = await listChangedFilesBetweenRevisions(from, to, {
    cwd,
    env,
    pathSpecs: relativePaths,
    runCommand: run,
  });

  return changed.length > 0;
}

async function isAncestor(
  ancestor,
  descendant,
  { cwd = ROOT_DIR, env, runCommand: run = runCommand } = {}
) {
  const result = await run(
    'git',
    ['merge-base', '--is-ancestor', ancestor, descendant],
    {
      cwd,
      env,
      stdio: 'pipe',
    }
  );

  return result.code === 0;
}

function isRecoverableGitCommandError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return /^Command failed \(\d+\): git /u.test(message);
}

function isGitIndexLockError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /\.git\/index\.lock/u.test(message) && /Unable to create/u.test(message)
  );
}

function isGitLockError(error) {
  return getGitLockPathFromError(error) != null;
}

function getGitFailureBackoffMs(attempt) {
  const n = Math.max(1, Number(attempt) || 1);
  const scaled = DEFAULT_GIT_FAILURE_BACKOFF_MS * 2 ** (n - 1);

  return Math.min(scaled, MAX_GIT_FAILURE_BACKOFF_MS);
}

async function resolveLockedBranchTarget({
  cwd = ROOT_DIR,
  env,
  fsImpl = require('node:fs'),
  paths = getWatchPaths(),
  runCommand: run = runCommand,
} = {}) {
  const existing = readWatchLock(paths, fsImpl);

  if (
    existing?.branch &&
    existing?.remote &&
    existing?.upstreamBranch &&
    existing?.upstreamRef
  ) {
    return {
      branch: existing.branch,
      remote: existing.remote,
      upstreamBranch: existing.upstreamBranch,
      upstreamRef: existing.upstreamRef,
    };
  }

  const branch = await getCurrentBranchName({ cwd, env, runCommand: run });
  const upstreamFull = await getTrackedUpstream({ cwd, env, runCommand: run });

  if (!upstreamFull) {
    throw new Error(
      `Branch ${branch} has no configured upstream. Set upstream tracking before running the watcher.`
    );
  }

  const parsed = parseUpstreamRef(upstreamFull);

  return {
    branch,
    remote: parsed.remote,
    upstreamBranch: parsed.branch,
    upstreamRef: parsed.upstreamRef,
  };
}

module.exports = {
  checkoutBranch,
  checkoutRevision,
  fetchTrackedBranch,
  getCommitMetadata,
  getCurrentBranch,
  getCurrentBranchName,
  getGitFailureBackoffMs,
  getRevision,
  getTrackedUpstream,
  gitStdout,
  hasDirtyWorktree,
  hasWatchedScriptChanges,
  isAncestor,
  isGitIndexLockError,
  isGitLockError,
  isRecoverableGitCommandError,
  listChangedFilesBetweenRevisions,
  listDirtyWorktreePaths,
  parseUpstreamRef,
  pullTrackedBranch,
  removeStaleGitLock,
  removeStaleGitIndexLock,
  resolveLockedBranchTarget,
};
