#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { runChecked, runCommand } = require('./docker-web/compose.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_DEPLOY_COMMAND = ['bun', 'serve:web:docker:bg'];
const MAX_EVENTS = 8;
const SELF_WATCHED_FILES = [path.relative(ROOT_DIR, __filename)];
const WATCH_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web', 'watch');
const WATCH_LOCK_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.lock'
);
const ANSI = {
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  yellow: '\x1b[33m',
};

function colorize(color, value) {
  return `${ANSI[color] ?? ''}${value}${ANSI.reset}`;
}

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

function formatClockTime(time) {
  if (!time) {
    return 'never';
  }

  return new Date(time).toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeTime(time, { now = Date.now() } = {}) {
  if (!time) {
    return 'never';
  }

  const diffMs = time - now;
  const absoluteMs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? 'from now' : 'ago';

  if (absoluteMs < 1_000) {
    return diffMs >= 0 ? 'in less than 1s' : 'just now';
  }

  const units = [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
  ];

  for (const [label, size] of units) {
    if (absoluteMs >= size) {
      const value = Math.floor(absoluteMs / size);
      return diffMs >= 0 ? `in ${value}${label}` : `${value}${label} ${suffix}`;
    }
  }

  return diffMs >= 0 ? 'in less than 1s' : 'just now';
}

function formatCountdown(time, { now = Date.now() } = {}) {
  if (!time) {
    return 'pending';
  }

  const remainingMs = Math.max(0, time - now);
  return `${(remainingMs / 1_000).toFixed(1)}s`;
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatRow(label, value) {
  return `${colorize('dim', `${label}:`.padEnd(14, ' '))} ${value}`;
}

function summarizeResult(result) {
  switch (result?.status) {
    case 'ahead':
      return colorize('yellow', 'Local branch ahead, waiting');
    case 'deploy-failed':
      return colorize('red', 'Deploy failed, watching');
    case 'deployed':
      return colorize('green', 'Deploy succeeded');
    case 'dirty':
      return colorize('yellow', 'Dirty worktree, waiting');
    case 'diverged':
      return colorize('yellow', 'Branch diverged, waiting');
    case 'restarting':
      return colorize('magenta', 'Restarting watcher');
    case 'up-to-date':
      return colorize('green', 'Up to date');
    default:
      return colorize('cyan', 'Watching');
  }
}

function buildDashboardView(state, { now = Date.now(), width = 100 } = {}) {
  const contentWidth = Math.max(72, Math.min(width, 120));
  const separator = colorize('dim', '-'.repeat(contentWidth));
  const latestCommit = state.latestCommit
    ? `${colorize('green', state.latestCommit.shortHash)} ${truncateText(
        state.latestCommit.subject,
        Math.max(24, contentWidth - 32)
      )}`
    : colorize('dim', 'unknown');
  const events =
    state.events.length > 0
      ? state.events.map((event) => {
          const levelColor =
            event.level === 'error'
              ? 'red'
              : event.level === 'warn'
                ? 'yellow'
                : 'cyan';

          return `${colorize('dim', `[${formatClockTime(event.time)}]`)} ${colorize(levelColor, event.level.toUpperCase().padEnd(5, ' '))} ${truncateText(event.message, Math.max(24, contentWidth - 20))}`;
        })
      : [colorize('dim', 'No events yet.')];

  return [
    colorize('bold', 'Tuturuuu Auto Deploy Watcher'),
    separator,
    formatRow(
      'Branch',
      `${colorize('cyan', state.target?.branch ?? 'unknown')} -> ${colorize(
        'cyan',
        state.target?.upstreamRef ?? 'unknown'
      )}`
    ),
    formatRow('Status', summarizeResult(state.lastResult)),
    formatRow('Interval', `${(state.intervalMs / 1_000).toFixed(1)}s`),
    formatRow('Started', formatClockTime(state.startedAt)),
    formatRow(
      'Latest',
      `${latestCommit} ${colorize(
        'dim',
        `(${formatRelativeTime(state.latestCommit?.committedAt, { now })})`
      )}`
    ),
    formatRow(
      'Last check',
      `${formatClockTime(state.lastCheckAt)} ${colorize(
        'dim',
        `(${formatRelativeTime(state.lastCheckAt, { now })})`
      )}`
    ),
    formatRow(
      'Next poll',
      `${formatCountdown(state.nextCheckAt, { now })} ${colorize(
        'dim',
        `(at ${formatClockTime(state.nextCheckAt)})`
      )}`
    ),
    formatRow(
      'Last deploy',
      state.lastDeployAt
        ? `${colorize(
            state.lastDeployStatus === 'failed' ? 'red' : 'green',
            state.lastDeployStatus === 'failed' ? 'failed' : 'successful'
          )} ${colorize(
            'dim',
            `(${formatRelativeTime(state.lastDeployAt, { now })})`
          )}`
        : colorize('dim', 'none yet')
    ),
    formatRow('Lock file', state.lockFile ?? colorize('dim', 'not acquired')),
    separator,
    colorize('bold', 'Recent Events'),
    ...events,
    separator,
    colorize(
      'dim',
      'Press Ctrl+C to stop. The watcher will restart itself if this script changes after a pull.'
    ),
  ].join('\n');
}

function createWatchUi(initialState = {}, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const now = options.now ?? (() => Date.now());
  const isTTY = options.isTTY ?? Boolean(stdout.isTTY);
  const maxEvents = options.maxEvents ?? MAX_EVENTS;
  const state = {
    events: [],
    intervalMs: DEFAULT_INTERVAL_MS,
    lastResult: null,
    ...initialState,
  };
  let cursorHidden = false;
  let closed = false;

  function render() {
    if (!isTTY || closed) {
      return;
    }

    const output = buildDashboardView(state, {
      now: now(),
      width: stdout.columns ?? 100,
    });

    readline.cursorTo(stdout, 0, 0);
    readline.clearScreenDown(stdout);
    stdout.write(output);
  }

  function start() {
    if (isTTY && !cursorHidden) {
      stdout.write('\x1b[?25l');
      cursorHidden = true;
      render();
    }
  }

  function pushEvent(level, message) {
    state.events = [
      {
        level,
        message,
        time: now(),
      },
      ...state.events,
    ].slice(0, maxEvents);

    if (!isTTY) {
      const writer = level === 'error' ? stderr : stdout;
      writer.write(`[auto-deploy] ${message}\n`);
    }

    render();
  }

  function update(patch) {
    Object.assign(state, patch);
    render();
  }

  function close() {
    if (closed) {
      return;
    }

    closed = true;

    if (isTTY) {
      render();
      stdout.write(`\n\x1b[?25h`);
      cursorHidden = false;
    }
  }

  return {
    close,
    error(message) {
      pushEvent('error', message);
    },
    info(message) {
      pushEvent('info', message);
    },
    render,
    start,
    state,
    update,
    warn(message) {
      pushEvent('warn', message);
    },
  };
}

async function gitStdout(args, { env, runCommand: run = runCommand } = {}) {
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

async function getCommitMetadata(
  ref,
  { env, runCommand: run = runCommand } = {}
) {
  const metadata = await gitStdout(
    ['log', '-1', '--format=%H%n%h%n%s%n%cI', ref],
    {
      env,
      runCommand: run,
    }
  );
  const [hash, shortHash, subject, committedAt] = metadata.split('\n');

  return {
    committedAt: committedAt ? Date.parse(committedAt) : null,
    hash,
    shortHash,
    subject,
  };
}

async function listChangedFilesBetweenRevisions(
  oldRevision,
  newRevision,
  relativePaths,
  { env, runCommand: run = runCommand } = {}
) {
  const output = await gitStdout(
    ['diff', '--name-only', oldRevision, newRevision, '--', ...relativePaths],
    {
      env,
      runCommand: run,
    }
  );

  return output
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function hasWatchedScriptChanges(
  oldRevision,
  newRevision,
  { env, relativePaths = SELF_WATCHED_FILES, runCommand: run = runCommand } = {}
) {
  const changedFiles = await listChangedFilesBetweenRevisions(
    oldRevision,
    newRevision,
    relativePaths,
    {
      env,
      runCommand: run,
    }
  );

  return changedFiles.length > 0;
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

async function spawnReplacementWatcher({
  argv = process.argv.slice(1),
  cwd = ROOT_DIR,
  env = process.env,
  execPath = process.execPath,
  spawnImpl = spawn,
} = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawnImpl(execPath, argv, {
      cwd,
      detached: true,
      env,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref?.();
      resolve(child);
    });
  });
}

async function runDeployWatchIteration(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    log = console,
    now = () => Date.now(),
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
      `Skipping poll because the worktree has uncommitted changes on ${target.branch}.`
    );
    return {
      checkedAt: now(),
      status: 'dirty',
    };
  }

  await fetchTrackedBranch(target, { env, runCommand: run });

  const localHead = await getRevision('HEAD', { env, runCommand: run });
  const upstreamHead = await getRevision(target.upstreamRef, {
    env,
    runCommand: run,
  });

  if (localHead === upstreamHead) {
    return {
      checkedAt: now(),
      latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
      status: 'up-to-date',
    };
  }

  if (await isAncestor(localHead, upstreamHead, { env, runCommand: run })) {
    await pullTrackedBranch(target, { env, runCommand: run });

    const updatedHead = await getRevision('HEAD', { env, runCommand: run });

    if (updatedHead === localHead) {
      return {
        checkedAt: now(),
        latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
        status: 'up-to-date',
      };
    }

    const restartRequired = await hasWatchedScriptChanges(
      localHead,
      updatedHead,
      {
        env,
        runCommand: run,
      }
    );
    const latestCommit = await getCommitMetadata('HEAD', {
      env,
      runCommand: run,
    });

    log.info?.(
      `Pulled ${target.branch} from ${localHead.slice(
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
        `Blue/green deployment completed for ${updatedHead.slice(0, 12)}.`
      );
      if (restartRequired) {
        log.warn?.(
          'Watcher script changed in the pulled revision. Restarting.'
        );
      }
      return {
        checkedAt: now(),
        latestCommit,
        newHead: updatedHead,
        oldHead: localHead,
        restartRequired,
        status: restartRequired ? 'restarting' : 'deployed',
      };
    } catch (error) {
      log.error?.(
        `Blue/green deployment failed for ${updatedHead.slice(0, 12)}: ${error instanceof Error ? error.message : String(error)}`
      );
      if (restartRequired) {
        log.warn?.(
          'Watcher script changed in the pulled revision. Restarting.'
        );
      }
      return {
        checkedAt: now(),
        error,
        latestCommit,
        newHead: updatedHead,
        oldHead: localHead,
        restartRequired,
        status: 'deploy-failed',
      };
    }
  }

  if (await isAncestor(upstreamHead, localHead, { env, runCommand: run })) {
    log.warn?.(
      `Local branch ${target.branch} is ahead of ${target.upstreamRef}; skipping auto-pull.`
    );
    return {
      checkedAt: now(),
      latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
      status: 'ahead',
    };
  }

  log.warn?.(
    `Local branch ${target.branch} diverged from ${target.upstreamRef}; skipping auto-pull.`
  );
  return {
    checkedAt: now(),
    latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
    status: 'diverged',
  };
}

async function runDeployWatchLoop(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    intervalMs = DEFAULT_INTERVAL_MS,
    log = console,
    now = () => Date.now(),
    once = false,
    onIterationResult = () => {},
    onIterationStart = () => {},
    runCommand: run = runCommand,
    sleepImpl = sleep,
  } = {}
) {
  while (true) {
    const startedAt = now();
    onIterationStart(startedAt);

    const result = await runDeployWatchIteration(target, {
      deployCommand,
      env,
      log,
      now,
      runCommand: run,
    });

    onIterationResult(result);

    if (once || result.restartRequired) {
      return result;
    }

    await sleepImpl(intervalMs);
  }
}

async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseArgs(argv);
  const env = options.env ?? process.env;
  const fsImpl = options.fsImpl ?? fs;
  const paths = getWatchPaths(options.rootDir ?? ROOT_DIR);
  const processImpl = options.processImpl ?? process;
  const ui =
    options.ui ??
    createWatchUi({
      intervalMs: parsed.intervalMs,
      lockFile: paths.lockFile,
      startedAt: Date.now(),
    });
  let released = false;

  const cleanup = () => {
    if (released) {
      return;
    }

    released = true;
    releaseWatchLock({
      fsImpl,
      paths,
      processImpl,
    });
  };

  const handleTermination = (signal) => {
    ui.warn(`Received ${signal}. Shutting down watcher.`);
    cleanup();
    ui.close();
    processImpl.exit(0);
  };

  try {
    const target = await resolveLockedBranchTarget({
      env,
      runCommand: options.runCommand ?? runCommand,
    });
    const latestCommit = await getCommitMetadata('HEAD', {
      env,
      runCommand: options.runCommand ?? runCommand,
    });

    ui.update({
      latestCommit,
      target,
    });
    acquireWatchLock(target, {
      fsImpl,
      paths,
      processImpl,
    });

    ui.start();
    ui.info(
      `Watching ${target.branch} (${target.upstreamRef}) every ${parsed.intervalMs}ms.`
    );
    ui.update({
      lockFile: paths.lockFile,
      nextCheckAt: Date.now(),
    });

    processImpl.on('SIGINT', () => {
      handleTermination('SIGINT');
    });
    processImpl.on('SIGTERM', () => {
      handleTermination('SIGTERM');
    });

    const result = await runDeployWatchLoop(target, {
      deployCommand: options.deployCommand ?? DEFAULT_DEPLOY_COMMAND,
      env,
      intervalMs: parsed.intervalMs,
      log: ui,
      now: options.now ?? (() => Date.now()),
      once: parsed.once,
      onIterationResult: (iterationResult) => {
        ui.update({
          lastCheckAt: iterationResult.checkedAt ?? Date.now(),
          lastDeployAt:
            iterationResult.status === 'deployed' ||
            iterationResult.status === 'deploy-failed' ||
            iterationResult.status === 'restarting'
              ? (iterationResult.checkedAt ?? Date.now())
              : ui.state.lastDeployAt,
          lastDeployStatus:
            iterationResult.status === 'deploy-failed'
              ? 'failed'
              : iterationResult.status === 'deployed' ||
                  iterationResult.status === 'restarting'
                ? 'successful'
                : ui.state.lastDeployStatus,
          lastResult: iterationResult,
          latestCommit: iterationResult.latestCommit ?? ui.state.latestCommit,
          nextCheckAt:
            iterationResult.restartRequired || parsed.once
              ? null
              : Date.now() + parsed.intervalMs,
        });
      },
      onIterationStart: (startedAt) => {
        ui.update({
          lastCheckAt: startedAt,
          nextCheckAt: startedAt + parsed.intervalMs,
        });
      },
      runCommand: options.runCommand ?? runCommand,
      sleepImpl: options.sleepImpl ?? sleep,
    });

    if (result?.restartRequired) {
      cleanup();
      await spawnReplacementWatcher({
        argv: options.restartArgv ?? process.argv.slice(1),
        cwd: options.rootDir ?? ROOT_DIR,
        env,
        execPath: options.execPath ?? process.execPath,
        spawnImpl: options.spawnImpl ?? spawn,
      });
      ui.close();
      return;
    }
  } catch (error) {
    ui.error(error instanceof Error ? error.message : String(error));
    processImpl.exitCode =
      error && typeof error === 'object' && typeof error.exitCode === 'number'
        ? error.exitCode
        : 1;
  } finally {
    cleanup();
    ui.close();
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_INTERVAL_MS,
  MAX_EVENTS,
  SELF_WATCHED_FILES,
  WATCH_LOCK_FILE,
  WATCH_RUNTIME_DIR,
  acquireWatchLock,
  buildDashboardView,
  createWatchUi,
  fetchTrackedBranch,
  formatClockTime,
  formatCountdown,
  formatRelativeTime,
  getCommitMetadata,
  getCurrentBranch,
  getRevision,
  getTrackedUpstream,
  getWatchPaths,
  hasDirtyWorktree,
  hasWatchedScriptChanges,
  isAncestor,
  isProcessAlive,
  listChangedFilesBetweenRevisions,
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
  spawnReplacementWatcher,
  summarizeResult,
  truncateText,
};
