#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { runChecked, runCommand } = require('./docker-web/compose.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_DEPLOY_COMMAND = ['bun', 'serve:web:docker:bg'];
const WATCH_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web', 'watch');
const WATCH_LOCK_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.lock'
);

function parseArgs(argv) {
  const args = [...argv];
  let intervalMs = DEFAULT_INTERVAL_MS;
  let once = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--interval-ms') {
      const value = Number(args[index + 1]);

      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Expected --interval-ms to be a positive number.');
      }

      intervalMs = value;
      index += 1;
      continue;
    }

    if (arg === '--once') {
      once = true;
      continue;
    }

    throw new Error(`Unsupported argument "${arg}".`);
  }

  return {
    intervalMs,
    once,
  };
}

function getWatchPaths(rootDir = ROOT_DIR) {
  const runtimeDir = path.join(rootDir, 'tmp', 'docker-web', 'watch');

  return {
    lockFile: path.join(runtimeDir, 'blue-green-auto-deploy.lock'),
    runtimeDir,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function gitStdout(args, { env, runCommand: run = runCommand }) {
  const result = await runChecked('git', args, {
    env,
    runCommand: run,
    stdio: 'pipe',
  });

  return result.stdout.trim();
}

function parseUpstreamRef(upstreamRef) {
  const separatorIndex = upstreamRef.indexOf('/');

  if (separatorIndex <= 0 || separatorIndex === upstreamRef.length - 1) {
    throw new Error(
      `Unable to parse tracked upstream "${upstreamRef}". Expected "<remote>/<branch>".`
    );
  }

  return {
    branch: upstreamRef.slice(separatorIndex + 1),
    remote: upstreamRef.slice(0, separatorIndex),
    upstreamRef,
  };
}

async function getCurrentBranch({ env, runCommand: run = runCommand } = {}) {
  const branch = await gitStdout(['rev-parse', '--abbrev-ref', 'HEAD'], {
    env,
    runCommand: run,
  });

  if (branch === 'HEAD') {
    throw new Error(
      'The auto-deploy watcher requires a named branch. Detached HEAD is not supported.'
    );
  }

  return branch;
}

async function getTrackedUpstream({ env, runCommand: run = runCommand } = {}) {
  const upstreamRef = await gitStdout(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    {
      env,
      runCommand: run,
    }
  );

  return parseUpstreamRef(upstreamRef);
}

async function resolveLockedBranchTarget({
  env,
  runCommand: run = runCommand,
} = {}) {
  const branch = await getCurrentBranch({ env, runCommand: run });
  const upstream = await getTrackedUpstream({ env, runCommand: run });

  return {
    branch,
    remote: upstream.remote,
    upstreamBranch: upstream.branch,
    upstreamRef: upstream.upstreamRef,
  };
}

function readWatchLock(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.lockFile)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(paths.lockFile, 'utf8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid, processImpl = process) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    processImpl.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function acquireWatchLock(
  target,
  { fsImpl = fs, paths = getWatchPaths(), processImpl = process } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });

  const existingLock = readWatchLock(paths, fsImpl);

  if (existingLock && isProcessAlive(existingLock.pid, processImpl)) {
    throw new Error(
      `Auto-deploy watcher already locked by PID ${existingLock.pid} on branch ${existingLock.branch}.`
    );
  }

  const lock = {
    branch: target.branch,
    createdAt: new Date().toISOString(),
    pid: processImpl.pid,
    remote: target.remote,
    upstreamBranch: target.upstreamBranch,
    upstreamRef: target.upstreamRef,
  };

  fsImpl.writeFileSync(paths.lockFile, JSON.stringify(lock, null, 2), 'utf8');
  return lock;
}

function releaseWatchLock({
  fsImpl = fs,
  paths = getWatchPaths(),
  processImpl = process,
} = {}) {
  const existingLock = readWatchLock(paths, fsImpl);

  if (!existingLock || existingLock.pid !== processImpl.pid) {
    return;
  }

  fsImpl.rmSync(paths.lockFile, { force: true });
}

async function getRevision(ref, { env, runCommand: run = runCommand } = {}) {
  return gitStdout(['rev-parse', ref], { env, runCommand: run });
}

async function hasDirtyWorktree({ env, runCommand: run = runCommand } = {}) {
  const status = await gitStdout(['status', '--porcelain'], {
    env,
    runCommand: run,
  });

  return status.length > 0;
}

async function fetchTrackedBranch(
  target,
  { env, runCommand: run = runCommand } = {}
) {
  await runChecked('git', ['fetch', target.remote, target.upstreamBranch], {
    env,
    runCommand: run,
  });
}

async function isAncestor(
  base,
  head,
  { env, runCommand: run = runCommand } = {}
) {
  const result = await run('git', ['merge-base', '--is-ancestor', base, head], {
    env,
    stdio: 'pipe',
  });

  if (result.code === 0) {
    return true;
  }

  if (result.code === 1) {
    return false;
  }

  const detail = result.stderr?.trim() || result.stdout?.trim();
  throw new Error(
    detail
      ? `Unable to compare revisions: ${detail}`
      : 'Unable to compare revisions.'
  );
}

async function pullTrackedBranch(
  target,
  { env, runCommand: run = runCommand } = {}
) {
  await runChecked(
    'git',
    ['pull', '--ff-only', target.remote, target.upstreamBranch],
    {
      env,
      runCommand: run,
    }
  );
}

async function runBlueGreenDeploy({
  deployCommand = DEFAULT_DEPLOY_COMMAND,
  env,
  runCommand: run = runCommand,
} = {}) {
  const [command, ...args] = deployCommand;
  await runChecked(command, args, {
    env,
    runCommand: run,
  });
}

async function runDeployWatchIteration(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    log = console,
    runCommand: run = runCommand,
  } = {}
) {
  const currentBranch = await getCurrentBranch({ env, runCommand: run });

  if (currentBranch !== target.branch) {
    throw new Error(
      `Current branch changed from ${target.branch} to ${currentBranch}. The watcher is locked to ${target.branch} and will stop.`
    );
  }

  if (await hasDirtyWorktree({ env, runCommand: run })) {
    log.warn?.(
      `[auto-deploy] Skipping poll because the worktree has uncommitted changes on ${target.branch}.`
    );
    return { status: 'dirty' };
  }

  await fetchTrackedBranch(target, { env, runCommand: run });

  const localHead = await getRevision('HEAD', { env, runCommand: run });
  const upstreamHead = await getRevision(target.upstreamRef, {
    env,
    runCommand: run,
  });

  if (localHead === upstreamHead) {
    return { status: 'up-to-date' };
  }

  if (await isAncestor(localHead, upstreamHead, { env, runCommand: run })) {
    await pullTrackedBranch(target, { env, runCommand: run });

    const updatedHead = await getRevision('HEAD', { env, runCommand: run });

    if (updatedHead === localHead) {
      return { status: 'up-to-date' };
    }

    log.info?.(
      `[auto-deploy] Pulled ${target.branch} from ${localHead.slice(
        0,
        12
      )} to ${updatedHead.slice(0, 12)}. Starting blue/green deployment.`
    );

    try {
      await runBlueGreenDeploy({
        deployCommand,
        env,
        runCommand: run,
      });
      log.info?.(
        `[auto-deploy] Blue/green deployment completed for ${updatedHead.slice(
          0,
          12
        )}.`
      );
      return {
        newHead: updatedHead,
        oldHead: localHead,
        status: 'deployed',
      };
    } catch (error) {
      log.error?.(
        `[auto-deploy] Blue/green deployment failed for ${updatedHead.slice(
          0,
          12
        )}: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        error,
        newHead: updatedHead,
        oldHead: localHead,
        status: 'deploy-failed',
      };
    }
  }

  if (await isAncestor(upstreamHead, localHead, { env, runCommand: run })) {
    log.warn?.(
      `[auto-deploy] Local branch ${target.branch} is ahead of ${target.upstreamRef}; skipping auto-pull.`
    );
    return { status: 'ahead' };
  }

  log.warn?.(
    `[auto-deploy] Local branch ${target.branch} diverged from ${target.upstreamRef}; skipping auto-pull.`
  );
  return { status: 'diverged' };
}

async function runDeployWatchLoop(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    intervalMs = DEFAULT_INTERVAL_MS,
    log = console,
    once = false,
    runCommand: run = runCommand,
    sleepImpl = sleep,
  } = {}
) {
  while (true) {
    const result = await runDeployWatchIteration(target, {
      deployCommand,
      env,
      log,
      runCommand: run,
    });

    if (once) {
      return result;
    }

    await sleepImpl(intervalMs);
  }
}

async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  const env = options.env ?? process.env;
  const fsImpl = options.fsImpl ?? fs;
  const log = options.log ?? console;
  const paths = getWatchPaths(options.rootDir ?? ROOT_DIR);
  let released = false;

  const cleanup = () => {
    if (released) {
      return;
    }

    released = true;
    releaseWatchLock({
      fsImpl,
      paths,
      processImpl: options.processImpl ?? process,
    });
  };

  try {
    const target = await resolveLockedBranchTarget({
      env,
      runCommand: options.runCommand ?? runCommand,
    });

    acquireWatchLock(target, {
      fsImpl,
      paths,
      processImpl: options.processImpl ?? process,
    });

    log.info?.(
      `[auto-deploy] Watching ${target.branch} (${target.upstreamRef}) every ${parsed.intervalMs}ms.`
    );

    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });

    await runDeployWatchLoop(target, {
      deployCommand: options.deployCommand ?? DEFAULT_DEPLOY_COMMAND,
      env,
      intervalMs: parsed.intervalMs,
      log,
      once: parsed.once,
      runCommand: options.runCommand ?? runCommand,
      sleepImpl: options.sleepImpl ?? sleep,
    });
  } catch (error) {
    log.error?.(error instanceof Error ? error.message : String(error));
    process.exitCode =
      error && typeof error === 'object' && typeof error.exitCode === 'number'
        ? error.exitCode
        : 1;
  } finally {
    cleanup();
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_INTERVAL_MS,
  WATCH_LOCK_FILE,
  WATCH_RUNTIME_DIR,
  acquireWatchLock,
  fetchTrackedBranch,
  getCurrentBranch,
  getRevision,
  getTrackedUpstream,
  getWatchPaths,
  hasDirtyWorktree,
  isAncestor,
  isProcessAlive,
  main,
  parseArgs,
  parseUpstreamRef,
  pullTrackedBranch,
  readWatchLock,
  releaseWatchLock,
  resolveLockedBranchTarget,
  runBlueGreenDeploy,
  runDeployWatchIteration,
  runDeployWatchLoop,
  sleep,
};
