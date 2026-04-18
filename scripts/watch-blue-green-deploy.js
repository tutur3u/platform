#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const {
  getBlueGreenPaths,
  readBlueGreenActiveColor,
} = require('./docker-web/blue-green.js');
const { getComposeEnvironment, WEB_ENV_FILE } = require('./docker-web/env.js');
const {
  getComposeCommandArgs,
  getComposeFile,
  runChecked,
  runCommand,
} = require('./docker-web/compose.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_DEPLOY_COMMAND = ['bun', 'serve:web:docker:bg'];
const MAX_DEPLOYMENTS = 3;
const MAX_EVENTS = 8;
const PROD_COMPOSE_FILE = getComposeFile('prod');
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const SELF_WATCHED_FILES = [path.relative(ROOT_DIR, __filename)];
const WATCH_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web', 'watch');
const WATCH_LOCK_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.lock'
);
const WATCH_HISTORY_FILE = path.join(
  WATCH_RUNTIME_DIR,
  'blue-green-auto-deploy.history.json'
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
    blueGreen: getBlueGreenPaths(rootDir),
    historyFile: path.join(runtimeDir, 'blue-green-auto-deploy.history.json'),
    lockFile: path.join(runtimeDir, 'blue-green-auto-deploy.lock'),
    runtimeDir,
  };
}

function getWatcherComposeEnv({
  baseEnv = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  return getComposeEnvironment({
    baseEnv,
    envFilePath,
    fsImpl,
    rootDir,
    withRedis: true,
  });
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

  if (absoluteMs < 1_000 || (diffMs >= 0 && absoluteMs < 5_000)) {
    return 'just now';
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
      return diffMs >= 0 ? `in ${value}${label}` : `${value}${label} ago`;
    }
  }

  return 'just now';
}

function formatCountdown(time, { now = Date.now() } = {}) {
  if (!time) {
    return 'pending';
  }

  const remainingMs = Math.max(0, time - now);
  return `${(remainingMs / 1_000).toFixed(1)}s`;
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 'n/a';
  }

  if (durationMs < 1_000) {
    return '<1s';
  }

  const units = [
    ['d', 86_400_000],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
  ];
  const parts = [];
  let remaining = durationMs;

  for (const [label, size] of units) {
    if (remaining < size && parts.length === 0) {
      continue;
    }

    const value = Math.floor(remaining / size);

    if (value <= 0) {
      continue;
    }

    parts.push(`${value}${label}`);
    remaining -= value * size;

    if (parts.length === 2) {
      break;
    }
  }

  return parts.join(' ') || '<1s';
}

function formatRequestCount(count) {
  if (!Number.isFinite(count) || count < 0) {
    return 'n/a';
  }

  return `${new Intl.NumberFormat('en-US').format(count)} req`;
}

function formatRequestsPerMinute(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 'n/a';
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    minimumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value)} rpm`;
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function stripAnsi(value) {
  return String(value).replace(new RegExp('\\u001B\\[[0-9;]*m', 'g'), '');
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

function summarizeBlueGreenRuntime(
  currentBlueGreen,
  { now = Date.now() } = {}
) {
  if (!currentBlueGreen || currentBlueGreen.state === 'idle') {
    return colorize('dim', 'idle');
  }

  if (currentBlueGreen.state === 'unknown') {
    return colorize('yellow', currentBlueGreen.message ?? 'unknown');
  }

  const base =
    currentBlueGreen.state === 'degraded'
      ? colorize(
          'yellow',
          `degraded${currentBlueGreen.activeColor ? ` (${currentBlueGreen.activeColor})` : ''}`
        )
      : colorize(
          'green',
          `serving ${currentBlueGreen.activeColor ?? 'unknown'}`
        );
  const details = [];

  if (currentBlueGreen.lifetimeMs != null) {
    details.push(`life ${formatDuration(currentBlueGreen.lifetimeMs)}`);
  }

  if (currentBlueGreen.requestCount != null) {
    details.push(formatRequestCount(currentBlueGreen.requestCount));
  }

  if (currentBlueGreen.averageRequestsPerMinute != null) {
    details.push(
      `avg ${formatRequestsPerMinute(currentBlueGreen.averageRequestsPerMinute)}`
    );
  }

  if (currentBlueGreen.peakRequestsPerMinute != null) {
    details.push(
      `peak ${formatRequestsPerMinute(currentBlueGreen.peakRequestsPerMinute)}`
    );
  }

  if (currentBlueGreen.activatedAt) {
    details.push(
      `since ${formatClockTime(currentBlueGreen.activatedAt)} (${formatRelativeTime(
        currentBlueGreen.activatedAt,
        { now }
      )})`
    );
  }

  if (details.length === 0) {
    return base;
  }

  return `${base} ${colorize('dim', `(${details.join(' · ')})`)}`;
}

function padCell(value, width, align = 'left') {
  const rawValue = String(value);
  const visibleValue = stripAnsi(rawValue);
  const normalized =
    visibleValue.length > width ? truncateText(visibleValue, width) : rawValue;
  const visibleLength = stripAnsi(normalized).length;
  const padding = Math.max(0, width - visibleLength);

  if (align === 'right') {
    return `${' '.repeat(padding)}${normalized}`;
  }

  return `${normalized}${' '.repeat(padding)}`;
}

function buildDeploymentTable(
  deployments,
  { now = Date.now(), width = 100 } = {}
) {
  if (!deployments || deployments.length === 0) {
    return [colorize('dim', 'No deployment history yet.')];
  }

  const innerWidth = Math.max(66, Math.min(width, 118));
  const topBorder = colorize('dim', `┌${'─'.repeat(innerWidth + 2)}┐`);
  const middleBorder = colorize('dim', `├${'─'.repeat(innerWidth + 2)}┤`);
  const bottomBorder = colorize('dim', `└${'─'.repeat(innerWidth + 2)}┘`);
  const rows = deployments.map((entry) => {
    const status =
      entry.status === 'failed'
        ? colorize('red', 'FAILED')
        : entry.endedAt
          ? colorize('cyan', 'ENDED')
          : colorize('green', 'ACTIVE');
    const timestamp = entry.finishedAt ?? entry.startedAt;
    const heading = `[${formatClockTime(timestamp)}] ${status} ${entry.activeColor ?? '-'}`;
    const commitLine =
      `${entry.commitShortHash ?? 'unknown'} ${entry.commitSubject ?? ''}`.trim();
    const lifecycle = entry.activatedAt
      ? `since ${formatClockTime(entry.activatedAt)}`
      : entry.startedAt
        ? `started ${formatClockTime(entry.startedAt)}`
        : '';
    const metricsOne = [
      `build ${formatDuration(entry.buildDurationMs)}`,
      `life ${formatDuration(entry.lifetimeMs)}`,
      `req ${formatRequestCount(entry.requestCount)}`,
    ].join('  ');
    const metricsTwo = [
      `avg ${formatRequestsPerMinute(entry.averageRequestsPerMinute)}`,
      `peak ${formatRequestsPerMinute(entry.peakRequestsPerMinute)}`,
      `age ${formatRelativeTime(timestamp, { now })}`,
    ].join('  ');

    return [
      topBorder,
      `│ ${padCell(heading, innerWidth)} │`,
      `│ ${padCell(commitLine, innerWidth)} │`,
      middleBorder,
      colorize('dim', `│ ${padCell(metricsOne, innerWidth)} │`),
      colorize('dim', `│ ${padCell(metricsTwo, innerWidth)} │`),
      colorize('dim', `│ ${padCell(lifecycle, innerWidth)} │`),
      bottomBorder,
    ];
  });

  return rows.flatMap((row, index) => (index === 0 ? row : ['', ...row]));
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
  const deployments =
    state.deployments?.length > 0
      ? buildDeploymentTable(state.deployments, {
          now,
          width: contentWidth,
        })
      : [colorize('dim', 'No deployment history yet.')];
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
    formatRow(
      'Blue/green',
      summarizeBlueGreenRuntime(state.currentBlueGreen, { now })
    ),
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
    '',
    separator,
    colorize('bold', 'Last 3 Deployments'),
    ...deployments,
    '',
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

function getLatestDeploymentSummary(deployments = []) {
  const latestDeployment = deployments[0];

  if (!latestDeployment) {
    return {
      lastDeployAt: null,
      lastDeployStatus: null,
    };
  }

  return {
    lastDeployAt:
      latestDeployment.finishedAt ??
      latestDeployment.activatedAt ??
      latestDeployment.startedAt ??
      null,
    lastDeployStatus:
      latestDeployment.status === 'failed' ? 'failed' : 'successful',
  };
}

function createWatchUi(initialState = {}, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const now = options.now ?? (() => Date.now());
  const isTTY = options.isTTY ?? Boolean(stdout.isTTY);
  const maxEvents = options.maxEvents ?? MAX_EVENTS;
  const state = {
    deployments: [],
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

function readDeploymentHistory(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.historyFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(paths.historyFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDeploymentHistory(history, paths = getWatchPaths(), fsImpl = fs) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.historyFile,
    JSON.stringify(history, null, 2),
    'utf8'
  );
}

function appendDeploymentHistory(
  entry,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  const history = readDeploymentHistory(paths, fsImpl);
  const nextHistory = history.map((existing, index) => {
    if (
      entry.status === 'successful' &&
      index >= 0 &&
      existing.status === 'successful' &&
      !existing.endedAt
    ) {
      return {
        ...existing,
        endedAt: entry.activatedAt ?? entry.finishedAt ?? entry.startedAt,
      };
    }

    return existing;
  });

  nextHistory.unshift(entry);

  const trimmed = nextHistory.slice(0, MAX_DEPLOYMENTS);
  writeDeploymentHistory(trimmed, paths, fsImpl);
  return trimmed;
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

function createQuietRunCommand(baseRun = runCommand) {
  return (command, args, options = {}) =>
    baseRun(command, args, {
      ...options,
      stdio: options.stdio ?? 'pipe',
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

async function getProdComposeServiceContainerId(
  serviceName,
  {
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const composeEnv = getWatcherComposeEnv({
    baseEnv: env,
    envFilePath,
    fsImpl,
    rootDir,
  });
  const result = await runChecked(
    'docker',
    getComposeCommandArgs(PROD_COMPOSE_FILE, [], 'ps', '-q', serviceName),
    {
      env: composeEnv,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return result.stdout.trim();
}

async function resolveCurrentBlueGreenStatus({
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  paths = getWatchPaths(),
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);

  try {
    const proxyContainerId = await getProdComposeServiceContainerId(
      BLUE_GREEN_PROXY_SERVICE,
      {
        env,
        envFilePath,
        fsImpl,
        rootDir,
        runCommand: run,
      }
    );

    if (!activeColor && !proxyContainerId) {
      return {
        activeColor: null,
        proxyRunning: false,
        state: 'idle',
      };
    }

    const activeServiceName = activeColor ? `web-${activeColor}` : null;
    const activeContainerId = activeServiceName
      ? await getProdComposeServiceContainerId(activeServiceName, {
          env,
          envFilePath,
          fsImpl,
          rootDir,
          runCommand: run,
        })
      : '';

    return {
      activeColor,
      activeServiceRunning: Boolean(activeContainerId),
      proxyRunning: Boolean(proxyContainerId),
      state:
        activeColor && proxyContainerId && activeContainerId
          ? 'serving'
          : proxyContainerId || activeContainerId || activeColor
            ? 'degraded'
            : 'idle',
    };
  } catch (error) {
    return {
      activeColor,
      message:
        error instanceof Error ? error.message : 'Unable to inspect blue/green',
      state: 'unknown',
    };
  }
}

function parseProxyLogEntries(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$/);

      if (!timestampMatch) {
        return null;
      }

      const [, isoTime, message] = timestampMatch;
      const time = Date.parse(isoTime);
      const requestMatch = message.match(
        /"([A-Z]+)\s+([^"\s]+)\s+HTTP\/[0-9.]+"/
      );

      if (!Number.isFinite(time) || !requestMatch) {
        return null;
      }

      return {
        path: requestMatch[2],
        time,
      };
    })
    .filter(Boolean);
}

function summarizeRequestRate(entries, startTime, endTime) {
  if (
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  ) {
    return {
      averageRequestsPerMinute: 0,
      peakRequestsPerMinute: 0,
      requestCount: 0,
    };
  }

  const bucketCounts = new Map();
  let requestCount = 0;

  for (const entry of entries) {
    if (entry.path === '/api/health') {
      continue;
    }

    if (entry.time < startTime || entry.time >= endTime) {
      continue;
    }

    requestCount += 1;
    const bucket = Math.floor(entry.time / 60_000);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }

  const durationMinutes = Math.max((endTime - startTime) / 60_000, 1 / 60);

  return {
    averageRequestsPerMinute: requestCount / durationMinutes,
    peakRequestsPerMinute: Math.max(0, ...bucketCounts.values()),
    requestCount,
  };
}

async function collectDeploymentTraffic(
  deployments,
  {
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    now = Date.now(),
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const successfulDeployments = deployments.filter(
    (entry) => entry.status === 'successful' && entry.activatedAt
  );

  if (successfulDeployments.length === 0) {
    return deployments.map((entry) => ({
      ...entry,
      averageRequestsPerMinute: null,
      lifetimeMs:
        entry.status === 'successful' && entry.activatedAt
          ? Math.max(0, (entry.endedAt ?? now) - entry.activatedAt)
          : null,
      peakRequestsPerMinute: null,
      requestCount: null,
    }));
  }

  try {
    const containerId = await getProdComposeServiceContainerId(
      BLUE_GREEN_PROXY_SERVICE,
      {
        env,
        envFilePath,
        fsImpl,
        rootDir,
        runCommand: run,
      }
    );

    if (!containerId) {
      return deployments.map((entry) => ({
        ...entry,
        averageRequestsPerMinute: null,
        lifetimeMs:
          entry.status === 'successful' && entry.activatedAt
            ? Math.max(0, (entry.endedAt ?? now) - entry.activatedAt)
            : null,
        peakRequestsPerMinute: null,
        requestCount: null,
      }));
    }

    const earliestActivatedAt = Math.min(
      ...successfulDeployments.map((entry) => entry.activatedAt)
    );
    const result = await runChecked(
      'docker',
      [
        'logs',
        '--timestamps',
        '--since',
        new Date(earliestActivatedAt).toISOString(),
        containerId,
      ],
      {
        env,
        runCommand: run,
        stdio: 'pipe',
      }
    );
    const entries = parseProxyLogEntries(result.stdout);

    return deployments.map((deployment) => {
      const lifetimeMs =
        deployment.status === 'successful' && deployment.activatedAt
          ? Math.max(0, (deployment.endedAt ?? now) - deployment.activatedAt)
          : null;

      if (deployment.status !== 'successful' || !deployment.activatedAt) {
        return {
          ...deployment,
          lifetimeMs,
          requestCount: null,
        };
      }

      const endTime = deployment.endedAt ?? now;
      const rateSummary = summarizeRequestRate(
        entries,
        deployment.activatedAt,
        endTime
      );

      return {
        ...deployment,
        averageRequestsPerMinute: rateSummary.averageRequestsPerMinute,
        lifetimeMs,
        peakRequestsPerMinute: rateSummary.peakRequestsPerMinute,
        requestCount: rateSummary.requestCount,
      };
    });
  } catch {
    return deployments.map((entry) => ({
      ...entry,
      averageRequestsPerMinute: null,
      lifetimeMs:
        entry.status === 'successful' && entry.activatedAt
          ? Math.max(0, (entry.endedAt ?? now) - entry.activatedAt)
          : null,
      peakRequestsPerMinute: null,
      requestCount: null,
    }));
  }
}

async function loadRuntimeSnapshot({
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  now = Date.now(),
  paths = getWatchPaths(),
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  history = null,
} = {}) {
  const currentBlueGreen = await resolveCurrentBlueGreenStatus({
    env,
    envFilePath,
    fsImpl,
    paths,
    rootDir,
    runCommand: run,
  });
  const deployments = await collectDeploymentTraffic(
    history ?? readDeploymentHistory(paths, fsImpl),
    {
      env,
      envFilePath,
      fsImpl,
      now,
      rootDir,
      runCommand: run,
    }
  );
  const activeDeployment = deployments.find(
    (entry) =>
      entry.status === 'successful' &&
      !entry.endedAt &&
      entry.activeColor &&
      entry.activeColor === currentBlueGreen.activeColor
  );

  return {
    currentBlueGreen: activeDeployment
      ? {
          ...currentBlueGreen,
          activatedAt: activeDeployment.activatedAt,
          averageRequestsPerMinute: activeDeployment.averageRequestsPerMinute,
          lifetimeMs: activeDeployment.lifetimeMs,
          peakRequestsPerMinute: activeDeployment.peakRequestsPerMinute,
          requestCount: activeDeployment.requestCount,
        }
      : currentBlueGreen,
    deployments,
  };
}

async function runDeployWatchIteration(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    log = console,
    now = () => Date.now(),
    paths = getWatchPaths(),
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const checkedAt = now();
  const attachRuntime = async (result, history = null) => {
    const snapshotNow = now();

    return {
      ...result,
      ...(await loadRuntimeSnapshot({
        env,
        envFilePath,
        fsImpl,
        now: snapshotNow,
        paths,
        rootDir,
        runCommand: run,
        history,
      })),
    };
  };
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
    return attachRuntime({
      checkedAt,
      status: 'dirty',
    });
  }

  await fetchTrackedBranch(target, { env, runCommand: run });

  const localHead = await getRevision('HEAD', { env, runCommand: run });
  const upstreamHead = await getRevision(target.upstreamRef, {
    env,
    runCommand: run,
  });

  if (localHead === upstreamHead) {
    return attachRuntime({
      checkedAt,
      latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
      status: 'up-to-date',
    });
  }

  if (await isAncestor(localHead, upstreamHead, { env, runCommand: run })) {
    await pullTrackedBranch(target, { env, runCommand: run });

    const updatedHead = await getRevision('HEAD', { env, runCommand: run });

    if (updatedHead === localHead) {
      return attachRuntime({
        checkedAt,
        latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
        status: 'up-to-date',
      });
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

    const deployStartedAt = now();

    try {
      await runBlueGreenDeploy({
        deployCommand,
        env,
        runCommand: run,
      });

      const deployFinishedAt = now();
      const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
      const history = appendDeploymentHistory(
        {
          activatedAt: deployFinishedAt,
          activeColor,
          buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
          commitHash: latestCommit.hash,
          commitShortHash: latestCommit.shortHash,
          commitSubject: latestCommit.subject,
          finishedAt: deployFinishedAt,
          startedAt: deployStartedAt,
          status: 'successful',
        },
        {
          fsImpl,
          paths,
        }
      );

      log.info?.(
        `Blue/green deployment completed for ${updatedHead.slice(0, 12)}.`
      );

      if (restartRequired) {
        log.warn?.(
          'Watcher script changed in the pulled revision. Restarting.'
        );
      }

      return attachRuntime(
        {
          checkedAt,
          latestCommit,
          newHead: updatedHead,
          oldHead: localHead,
          restartRequired,
          status: restartRequired ? 'restarting' : 'deployed',
        },
        history
      );
    } catch (error) {
      const deployFinishedAt = now();
      const history = appendDeploymentHistory(
        {
          buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
          commitHash: latestCommit.hash,
          commitShortHash: latestCommit.shortHash,
          commitSubject: latestCommit.subject,
          finishedAt: deployFinishedAt,
          startedAt: deployStartedAt,
          status: 'failed',
        },
        {
          fsImpl,
          paths,
        }
      );

      log.error?.(
        `Blue/green deployment failed for ${updatedHead.slice(0, 12)}: ${error instanceof Error ? error.message : String(error)}`
      );

      if (restartRequired) {
        log.warn?.(
          'Watcher script changed in the pulled revision. Restarting.'
        );
      }

      return attachRuntime(
        {
          checkedAt,
          error,
          latestCommit,
          newHead: updatedHead,
          oldHead: localHead,
          restartRequired,
          status: 'deploy-failed',
        },
        history
      );
    }
  }

  if (await isAncestor(upstreamHead, localHead, { env, runCommand: run })) {
    log.warn?.(
      `Local branch ${target.branch} is ahead of ${target.upstreamRef}; skipping auto-pull.`
    );
    return attachRuntime({
      checkedAt,
      latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
      status: 'ahead',
    });
  }

  log.warn?.(
    `Local branch ${target.branch} diverged from ${target.upstreamRef}; skipping auto-pull.`
  );
  return attachRuntime({
    checkedAt,
    latestCommit: await getCommitMetadata('HEAD', { env, runCommand: run }),
    status: 'diverged',
  });
}

async function runDeployWatchLoop(
  target,
  {
    deployCommand = DEFAULT_DEPLOY_COMMAND,
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    intervalMs = DEFAULT_INTERVAL_MS,
    log = console,
    now = () => Date.now(),
    once = false,
    onIterationResult = () => {},
    onIterationStart = () => {},
    paths = getWatchPaths(),
    rootDir = ROOT_DIR,
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
      envFilePath,
      fsImpl,
      log,
      now,
      paths,
      rootDir,
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
  const rootDir = options.rootDir ?? ROOT_DIR;
  const envFilePath =
    options.envFilePath ?? path.join(rootDir, 'apps', 'web', '.env.local');
  const paths = getWatchPaths(rootDir);
  const processImpl = options.processImpl ?? process;
  const run = createQuietRunCommand(options.runCommand ?? runCommand);
  const initialRuntimeSnapshot = await loadRuntimeSnapshot({
    env,
    envFilePath,
    fsImpl,
    now: Date.now(),
    paths,
    rootDir,
    runCommand: run,
  });
  const initialDeploymentSummary = getLatestDeploymentSummary(
    initialRuntimeSnapshot.deployments
  );
  const ui =
    options.ui ??
    createWatchUi({
      currentBlueGreen: initialRuntimeSnapshot.currentBlueGreen,
      deployments: initialRuntimeSnapshot.deployments,
      intervalMs: parsed.intervalMs,
      lastDeployAt: initialDeploymentSummary.lastDeployAt,
      lastDeployStatus: initialDeploymentSummary.lastDeployStatus,
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
      runCommand: run,
    });
    const latestCommit = await getCommitMetadata('HEAD', {
      env,
      runCommand: run,
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
      envFilePath,
      fsImpl,
      intervalMs: parsed.intervalMs,
      log: ui,
      now: options.now ?? (() => Date.now()),
      once: parsed.once,
      onIterationResult: (iterationResult) => {
        const latestDeploymentSummary = getLatestDeploymentSummary(
          iterationResult.deployments ?? ui.state.deployments
        );
        ui.update({
          currentBlueGreen:
            iterationResult.currentBlueGreen ?? ui.state.currentBlueGreen,
          deployments: iterationResult.deployments ?? ui.state.deployments,
          lastCheckAt: iterationResult.checkedAt ?? Date.now(),
          lastDeployAt:
            iterationResult.status === 'deployed' ||
            iterationResult.status === 'deploy-failed' ||
            iterationResult.status === 'restarting'
              ? (iterationResult.deployments?.[0]?.finishedAt ??
                iterationResult.checkedAt ??
                Date.now())
              : (ui.state.lastDeployAt ?? latestDeploymentSummary.lastDeployAt),
          lastDeployStatus:
            iterationResult.status === 'deploy-failed'
              ? 'failed'
              : iterationResult.status === 'deployed' ||
                  iterationResult.status === 'restarting'
                ? 'successful'
                : (ui.state.lastDeployStatus ??
                  latestDeploymentSummary.lastDeployStatus),
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
      paths,
      rootDir,
      runCommand: run,
      sleepImpl: options.sleepImpl ?? sleep,
    });

    if (result?.restartRequired) {
      cleanup();
      await spawnReplacementWatcher({
        argv: options.restartArgv ?? process.argv.slice(1),
        cwd: rootDir,
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
  BLUE_GREEN_PROXY_SERVICE,
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_INTERVAL_MS,
  MAX_DEPLOYMENTS,
  MAX_EVENTS,
  SELF_WATCHED_FILES,
  WATCH_HISTORY_FILE,
  WATCH_LOCK_FILE,
  WATCH_RUNTIME_DIR,
  acquireWatchLock,
  appendDeploymentHistory,
  buildDashboardView,
  collectDeploymentTraffic,
  createWatchUi,
  fetchTrackedBranch,
  formatClockTime,
  formatCountdown,
  formatDuration,
  formatRelativeTime,
  formatRequestsPerMinute,
  getLatestDeploymentSummary,
  getCommitMetadata,
  getCurrentBranch,
  getProdComposeServiceContainerId,
  getRevision,
  getTrackedUpstream,
  getWatcherComposeEnv,
  getWatchPaths,
  hasDirtyWorktree,
  hasWatchedScriptChanges,
  isAncestor,
  isProcessAlive,
  listChangedFilesBetweenRevisions,
  loadRuntimeSnapshot,
  main,
  parseArgs,
  parseProxyLogEntries,
  parseUpstreamRef,
  pullTrackedBranch,
  readDeploymentHistory,
  readWatchLock,
  releaseWatchLock,
  resolveCurrentBlueGreenStatus,
  resolveLockedBranchTarget,
  runBlueGreenDeploy,
  runDeployWatchIteration,
  runDeployWatchLoop,
  sleep,
  spawnReplacementWatcher,
  stripAnsi,
  summarizeRequestRate,
  createQuietRunCommand,
  summarizeBlueGreenRuntime,
  summarizeResult,
  writeDeploymentHistory,
};
