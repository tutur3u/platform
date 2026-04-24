#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const {
  readBlueGreenActiveColor,
  readBlueGreenDeploymentStamp,
  refreshBlueGreenProxyIfRunning,
  runBlueGreenStandbyRefreshWorkflow,
} = require('./docker-web/blue-green.js');
const {
  ensureProductionRedisToken,
  ensureWebEnvFile,
  getComposeEnvironment,
  WEB_ENV_FILE,
} = require('./docker-web/env.js');
const {
  getComposeCommandArgs,
  getComposeFile,
  runChecked,
  runCommand,
} = require('./docker-web/compose.js');
const {
  ROOT_DIR,
  WATCH_ARGS_FILE,
  WATCH_HISTORY_FILE,
  WATCH_LOCK_FILE,
  WATCH_LOG_FILE,
  WATCH_PENDING_DEPLOY_FILE,
  WATCH_RUNTIME_DIR,
  WATCH_STATUS_FILE,
  getWatchPaths,
} = require('./watch-blue-green/paths.js');
const {
  MAX_DEPLOYMENTS,
  SKIP_WATCH_HISTORY_ENV,
  appendDeploymentHistory,
  createPendingDeploymentEntry,
  getLatestDeploymentSummary,
  prependPendingDeployment,
  readDeploymentHistory,
  writeDeploymentHistory,
} = require('./watch-blue-green/history.js');
const {
  enrichDeploymentsWithTelemetry,
  parseProxyLogEntries,
  readTelemetrySummary,
  summarizeRequestRate,
  syncProxyTrafficStore,
} = require('./watch-blue-green/telemetry.js');
const {
  appendWatcherLogEntry,
  createWatcherLogEntry,
  readWatcherLogEntries,
} = require('./watch-blue-green/logs.js');
const {
  clearInstantRolloutRequest,
  readInstantRolloutRequest,
} = require('./watch-blue-green/control.js');
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_DEPLOY_COMMAND = ['bun', 'serve:web:docker:bg'];
const DEFAULT_GIT_FAILURE_BACKOFF_MS = 60_000;
const DEFAULT_STANDBY_REFRESH_AFTER_MS = 15 * 60_000;
const DEFAULT_LOCK_CONFLICT_ACTION = 'fail';
const MAX_GIT_FAILURE_BACKOFF_MS = 15 * 60_000;
const DEFAULT_REPLACE_WATCHER_TIMEOUT_MS = 5_000;
const CONTAINER_SELF_RESTART_EXIT_CODE = 75;
const MAX_EVENTS = 8;
const DISPLAY_DEPLOYMENTS = 3;
const BLUE_GREEN_COLORS = ['blue', 'green'];
const PROD_COMPOSE_FILE = getComposeFile('prod');
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const BLUE_GREEN_WATCHER_SERVICE = 'web-blue-green-watcher';
const HOST_WORKSPACE_DIR_ENV = 'PLATFORM_HOST_WORKSPACE_DIR';
const SELF_WATCHED_FILES = [
  path.relative(ROOT_DIR, __filename),
  'scripts/docker-web.js',
  'scripts/docker-web/blue-green.js',
  'scripts/docker-web/compose.js',
  'scripts/docker-web/env.js',
];
const CONTAINER_REFRESH_WATCHED_FILES = [
  'docker-compose.web.prod.yml',
  'apps/discord/Dockerfile.markitdown',
  'apps/storage-unzip-proxy/Dockerfile',
  'apps/web/docker/blue-green-watcher-entrypoint.js',
  'apps/web/docker/blue-green-watcher.Dockerfile',
];
const WATCH_PENDING_DEPLOY_ENV = 'WATCHER_PENDING_BLUE_GREEN_DEPLOY';
const WATCHER_CONTAINER_ENV = 'PLATFORM_BLUE_GREEN_WATCHER_CONTAINER';
const ANSI = {
  blue: '\x1b[34m',
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

function emphasize(color, value) {
  return `${ANSI.bold}${ANSI[color] ?? ''}${value}${ANSI.reset}`;
}

function parseArgs(argv) {
  const args = [...argv];
  let intervalMs = DEFAULT_INTERVAL_MS;
  let lockConflictAction = DEFAULT_LOCK_CONFLICT_ACTION;
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

    if (arg === '--resume-if-running') {
      lockConflictAction = 'resume';
      continue;
    }

    if (arg === '--replace-existing') {
      lockConflictAction = 'replace';
      continue;
    }

    if (arg === '--if-locked') {
      const value = args[index + 1];

      if (!['fail', 'resume', 'replace'].includes(value)) {
        throw new Error(
          'Expected --if-locked to be one of: fail, resume, replace.'
        );
      }

      lockConflictAction = value;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument "${arg}".`);
  }

  return {
    intervalMs,
    lockConflictAction,
    once,
  };
}

function getWatcherComposeEnv({
  baseEnv = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  return {
    ...getComposeEnvironment({
      baseEnv,
      envFilePath,
      fsImpl,
      rootDir,
      withRedis: true,
    }),
    [HOST_WORKSPACE_DIR_ENV]: rootDir,
  };
}

function writeWatchArgsFile(
  argv,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(paths.argsFile, JSON.stringify(argv, null, 2), 'utf8');
}

function readWatchArgsFile({ fsImpl = fs, paths = getWatchPaths() } = {}) {
  if (!fsImpl.existsSync(paths.argsFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(paths.argsFile, 'utf8'));
    return Array.isArray(parsed) &&
      parsed.every((value) => typeof value === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function clearContainerManagedWatcherState({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  fsImpl.rmSync(paths.lockFile, { force: true });
  fsImpl.rmSync(paths.statusFile, { force: true });
}

async function startBlueGreenWatcherContainer(
  argv,
  {
    env = process.env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  parseArgs(argv);

  await runChecked('docker', ['compose', 'version'], {
    env,
    fsImpl,
    runCommand: run,
    stdio: 'ignore',
  });

  ensureWebEnvFile(fsImpl, envFilePath);
  ensureProductionRedisToken(
    {
      composeGlobalArgs: ['--profile', 'redis'],
      mode: 'prod',
    },
    env,
    (composeGlobalArgs, profileName) => composeGlobalArgs.includes(profileName),
    {
      fsImpl,
      rootDir,
    }
  );

  const composeEnv = getWatcherComposeEnv({
    baseEnv: env,
    envFilePath,
    fsImpl,
    rootDir,
  });

  clearContainerManagedWatcherState({
    fsImpl,
    paths: getWatchPaths(rootDir),
  });
  writeWatchArgsFile(argv, {
    fsImpl,
    paths: getWatchPaths(rootDir),
  });

  await runChecked(
    'docker',
    getComposeCommandArgs(
      PROD_COMPOSE_FILE,
      ['--profile', 'redis'],
      'up',
      '--build',
      '--detach',
      '--force-recreate',
      '--remove-orphans',
      BLUE_GREEN_WATCHER_SERVICE
    ),
    {
      env: composeEnv,
      fsImpl,
      runCommand: run,
    }
  );
}

async function streamBlueGreenWatcherLogs({
  env = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const composeEnv = getWatcherComposeEnv({
    baseEnv: env,
    envFilePath,
    fsImpl,
    rootDir,
  });
  const result = await run(
    'docker',
    getComposeCommandArgs(
      PROD_COMPOSE_FILE,
      ['--profile', 'redis'],
      'logs',
      '--follow',
      '--tail',
      '100',
      BLUE_GREEN_WATCHER_SERVICE
    ),
    {
      env: composeEnv,
      fsImpl,
    }
  );

  if (
    result.signal &&
    (result.signal === 'SIGINT' || result.signal === 'SIGTERM')
  ) {
    return;
  }

  if (result.code !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    throw new Error(
      detail
        ? `Unable to stream watcher logs.\n${detail}`
        : 'Unable to stream watcher logs.'
    );
  }
}

async function runWatcherCommand(argv = process.argv.slice(2), options = {}) {
  await startBlueGreenWatcherContainer(argv, options);
  await streamBlueGreenWatcherLogs(options);
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

function formatRequestsPerDay(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 'n/a';
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    minimumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value)}/day`;
}

function formatDailyRequestCount(count) {
  if (!Number.isFinite(count) || count < 0) {
    return 'n/a';
  }

  return `${new Intl.NumberFormat('en-US').format(count)} req`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'n/a';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value)} ${units[unitIndex]}`;
}

function formatCpuPercent(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 'n/a';
  }

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    minimumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value)}%`;
}

function formatMetric(label, value, color) {
  return `${colorize(color, label)} ${emphasize(color, value)}`;
}

function getDeploymentElapsedMs(entry, { now = Date.now() } = {}) {
  if (!entry?.startedAt) {
    return null;
  }

  if (entry.status !== 'building' && entry.status !== 'deploying') {
    return null;
  }

  return Math.max(0, now - entry.startedAt);
}

function truncateText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function stripAnsi(value) {
  // biome-ignore lint/complexity/useRegexLiterals: literal form triggers noControlCharactersInRegex here
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
    case 'git-failed':
      return colorize('yellow', 'Git failed, retrying');
    case 'restarting':
      return colorize('magenta', 'Restarting watcher');
    case 'standby-refresh-failed':
      return colorize('red', 'Standby refresh failed');
    case 'standby-refreshed':
      return colorize('green', 'Standby refreshed');
    case 'up-to-date':
      return colorize('green', 'Up to date');
    default:
      return colorize('cyan', 'Watching');
  }
}

function getResultErrorLines(result) {
  const message =
    result?.error instanceof Error
      ? result.error.message
      : typeof result?.error === 'string'
        ? result.error
        : '';

  if (!message) {
    return [];
  }

  return stripAnsi(message)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
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
    details.push(
      formatMetric(
        'life',
        formatDuration(currentBlueGreen.lifetimeMs),
        'magenta'
      )
    );
  }

  if (currentBlueGreen.requestCount != null) {
    details.push(
      formatMetric(
        'req',
        formatRequestCount(currentBlueGreen.requestCount),
        'green'
      )
    );
  }

  if (currentBlueGreen.averageRequestsPerMinute != null) {
    details.push(
      formatMetric(
        'avg',
        formatRequestsPerMinute(currentBlueGreen.averageRequestsPerMinute),
        'blue'
      )
    );
  }

  if (currentBlueGreen.peakRequestsPerMinute != null) {
    details.push(
      formatMetric(
        'peak',
        formatRequestsPerMinute(currentBlueGreen.peakRequestsPerMinute),
        'yellow'
      )
    );
  }

  if (currentBlueGreen.dailyRequestCount != null) {
    details.push(
      formatMetric(
        'day',
        formatDailyRequestCount(currentBlueGreen.dailyRequestCount),
        'cyan'
      )
    );
  }

  if (currentBlueGreen.dailyAverageRequests != null) {
    details.push(
      formatMetric(
        'davg',
        formatRequestsPerDay(currentBlueGreen.dailyAverageRequests),
        'blue'
      )
    );
  }

  if (currentBlueGreen.dailyPeakRequests != null) {
    details.push(
      formatMetric(
        'dpeak',
        formatRequestsPerDay(currentBlueGreen.dailyPeakRequests),
        'red'
      )
    );
  }

  if (currentBlueGreen.activatedAt) {
    details.push(
      `${colorize('dim', 'since')} ${emphasize(
        'cyan',
        formatClockTime(currentBlueGreen.activatedAt)
      )} ${colorize(
        'dim',
        `(${formatRelativeTime(currentBlueGreen.activatedAt, {
          now,
        })})`
      )}`
    );
  }

  if (details.length === 0) {
    return base;
  }

  return `${base} ${colorize('dim', `(${details.join(' · ')})`)}`;
}

function summarizeDockerResources(resources) {
  if (!resources || resources.state === 'idle') {
    return colorize('dim', 'idle');
  }

  if (resources.state === 'unavailable') {
    return colorize('yellow', resources.message ?? 'unavailable');
  }

  const details = [
    formatMetric('cpu', formatCpuPercent(resources.totalCpuPercent), 'yellow'),
    formatMetric('mem', formatBytes(resources.totalMemoryBytes), 'magenta'),
    formatMetric('rx', formatBytes(resources.totalRxBytes), 'cyan'),
    formatMetric('tx', formatBytes(resources.totalTxBytes), 'blue'),
    formatMetric(
      'ctr',
      new Intl.NumberFormat('en-US').format(resources.containers.length),
      'green'
    ),
  ];

  return (
    colorize('green', 'live') + colorize('dim', ` (${details.join(' · ')})`)
  );
}

function summarizeDockerContainers(resources, maxContainers = 4) {
  if (!resources || resources.state === 'idle') {
    return colorize('dim', 'idle');
  }

  if (resources.state === 'unavailable') {
    return colorize('yellow', resources.message ?? 'unavailable');
  }

  if (!resources?.containers?.length) {
    return colorize('dim', 'none');
  }

  return resources.containers
    .slice(0, maxContainers)
    .map((container) =>
      [
        formatBadge(container.label.toUpperCase(), container.color),
        formatMetric('cpu', formatCpuPercent(container.cpuPercent), 'yellow'),
        formatMetric('mem', formatBytes(container.memoryBytes), 'magenta'),
        formatMetric(
          'net',
          `${formatBytes(container.rxBytes)} / ${formatBytes(container.txBytes)}`,
          'cyan'
        ),
      ].join(' ')
    )
    .join(colorize('dim', '  ·  '));
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

function formatBadge(label, color) {
  return emphasize(color, `[${label}]`);
}

function getDeploymentStatusMeta(entry) {
  if (entry.runtimeState) {
    return {
      color: entry.runtimeState === 'standby' ? 'blue' : 'green',
      label: entry.runtimeState === 'standby' ? 'STANDBY' : 'ACTIVE',
    };
  }

  if (entry.status === 'failed') {
    return {
      color: 'red',
      label: 'FAILED',
    };
  }

  if (entry.status === 'building') {
    return {
      color: 'magenta',
      label: 'BUILDING',
    };
  }

  if (entry.status === 'deploying') {
    return {
      color: 'cyan',
      label: 'DEPLOYING',
    };
  }

  if (entry.endedAt) {
    return {
      color: 'cyan',
      label: 'ENDED',
    };
  }

  return {
    color: 'green',
    label: 'ACTIVE',
  };
}

function getDeploymentBorderColor(entry) {
  if (entry.runtimeState === 'active') {
    return 'green';
  }

  if (entry.runtimeState === 'standby') {
    return 'blue';
  }

  return getDeploymentStatusMeta(entry).color;
}

function getDeploymentPhaseBadges(entry) {
  if (entry.deploymentKind === 'standby-refresh') {
    if (entry.status === 'building' || entry.status === 'deploying') {
      return [formatBadge('REFRESHING', 'blue')];
    }

    if (entry.status === 'failed') {
      return [formatBadge('REFRESH FAILED', 'red')];
    }

    if (entry.runtimeState === 'standby') {
      return [formatBadge('STANDBY SYNCED', 'blue')];
    }

    return [formatBadge('SYNCED', 'blue')];
  }

  if (entry.status === 'building') {
    return [formatBadge('PENDING', 'magenta')];
  }

  if (entry.status === 'deploying') {
    return [formatBadge('PROMOTING', 'cyan')];
  }

  if (entry.status === 'failed') {
    return [formatBadge('FAILED ROLLOUT', 'red')];
  }

  if (entry.runtimeState === 'active') {
    return [formatBadge('PROMOTED', 'green')];
  }

  if (entry.runtimeState === 'standby') {
    return [formatBadge('STANDBY READY', 'blue')];
  }

  if (entry.endedAt) {
    return [formatBadge('RETIRED', 'dim')];
  }

  return [formatBadge('DEPLOYED', 'green')];
}

function formatHeaderLine(left, right, width) {
  const leftText = stripAnsi(left);
  const rightText = stripAnsi(right);

  if (leftText.length + rightText.length + 3 > width) {
    return truncateText(`${leftText} ${rightText}`, width);
  }

  return `${left}${' '.repeat(width - leftText.length - rightText.length)}${right}`;
}

function buildMetricBand(metrics, width) {
  return padCell(metrics.join('  '), width);
}

function getDeploymentSortTime(entry) {
  return (
    entry.finishedAt ??
    entry.activatedAt ??
    entry.startedAt ??
    entry.endedAt ??
    0
  );
}

function getDeploymentDisplayPriority(entry) {
  if (entry.status === 'building' || entry.status === 'deploying') {
    return 0;
  }

  if (entry.runtimeState === 'active') {
    return 1;
  }

  if (entry.runtimeState === 'standby') {
    return 2;
  }

  if (entry.status === 'failed') {
    return 3;
  }

  if (!entry.endedAt) {
    return 4;
  }

  return 5;
}

function selectDeploymentsForDisplay(
  deployments,
  maxDeployments = DISPLAY_DEPLOYMENTS
) {
  if (!deployments?.length) {
    return [];
  }

  return deployments
    .map((entry, index) => ({
      entry,
      index,
      priority: getDeploymentDisplayPriority(entry),
      sortTime: getDeploymentSortTime(entry),
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      if (left.sortTime !== right.sortTime) {
        return right.sortTime - left.sortTime;
      }

      return left.index - right.index;
    })
    .slice(0, maxDeployments)
    .map((item) => item.entry);
}

function buildDeploymentTable(
  deployments,
  { now = Date.now(), width = 100 } = {}
) {
  if (!deployments || deployments.length === 0) {
    return [colorize('dim', 'No deployment history yet.')];
  }

  const innerWidth = Math.max(66, Math.min(width, 118));
  const rows = deployments.map((entry) => {
    const statusMeta = getDeploymentStatusMeta(entry);
    const borderColor = getDeploymentBorderColor(entry);
    const timestamp = entry.finishedAt ?? entry.startedAt;
    const heading = formatHeaderLine(
      `${colorize('dim', `[${formatClockTime(timestamp)}]`)} ${emphasize(
        'cyan',
        entry.commitShortHash ?? 'unknown'
      )}`,
      [
        formatBadge(statusMeta.label, statusMeta.color),
        entry.activeColor ? formatBadge(entry.activeColor, 'cyan') : null,
      ]
        .filter(Boolean)
        .join(' '),
      innerWidth
    );
    const commitLine = `${entry.commitSubject ?? 'Unknown deployment'}`.trim();
    const metaLine = [
      ...getDeploymentPhaseBadges(entry),
      entry.runtimeState
        ? formatBadge(
            entry.runtimeState === 'standby' ? 'WARM BACKUP' : 'LIVE TRAFFIC',
            entry.runtimeState === 'standby' ? 'blue' : 'green'
          )
        : null,
    ]
      .filter(Boolean)
      .join(' ');
    const lifecycle = entry.activatedAt
      ? `${colorize('dim', 'since')} ${emphasize(
          'cyan',
          formatClockTime(entry.activatedAt)
        )}`
      : entry.startedAt
        ? `${colorize('dim', 'started')} ${emphasize(
            'cyan',
            formatClockTime(entry.startedAt)
          )}`
        : '';
    const elapsedMs = getDeploymentElapsedMs(entry, { now });
    const metricsOne = [
      elapsedMs != null
        ? formatMetric('elapsed', formatDuration(elapsedMs), 'cyan')
        : formatMetric('build', formatDuration(entry.buildDurationMs), 'cyan'),
      formatMetric('life', formatDuration(entry.lifetimeMs), 'magenta'),
      formatMetric('age', formatRelativeTime(timestamp, { now }), 'dim'),
    ];
    const metricsTwo = [
      formatMetric('req', formatRequestCount(entry.requestCount), 'green'),
      formatMetric(
        'avg',
        formatRequestsPerMinute(entry.averageRequestsPerMinute),
        'blue'
      ),
      formatMetric(
        'peak',
        formatRequestsPerMinute(entry.peakRequestsPerMinute),
        'yellow'
      ),
    ];
    const metricsThree = [
      formatMetric(
        'day',
        formatDailyRequestCount(entry.dailyRequestCount),
        'cyan'
      ),
      formatMetric(
        'davg',
        formatRequestsPerDay(entry.dailyAverageRequests),
        'blue'
      ),
      formatMetric(
        'dpeak',
        formatRequestsPerDay(entry.dailyPeakRequests),
        'red'
      ),
    ];
    const topBorder = colorize(borderColor, `╭${'─'.repeat(innerWidth + 2)}╮`);
    const middleBorder = colorize('dim', `├${'─'.repeat(innerWidth + 2)}┤`);
    const bottomBorder = colorize(
      borderColor,
      `╰${'─'.repeat(innerWidth + 2)}╯`
    );

    return [
      topBorder,
      `${colorize(borderColor, '│')} ${padCell(heading, innerWidth)} ${colorize(borderColor, '│')}`,
      `${colorize(borderColor, '│')} ${padCell(commitLine, innerWidth)} ${colorize(borderColor, '│')}`,
      `${colorize(borderColor, '│')} ${padCell(metaLine, innerWidth)} ${colorize(borderColor, '│')}`,
      middleBorder,
      `${colorize(borderColor, '│')} ${buildMetricBand(metricsOne, innerWidth)} ${colorize(borderColor, '│')}`,
      `${colorize(borderColor, '│')} ${buildMetricBand(metricsTwo, innerWidth)} ${colorize(borderColor, '│')}`,
      `${colorize(borderColor, '│')} ${buildMetricBand(metricsThree, innerWidth)} ${colorize(borderColor, '│')}`,
      `${colorize(borderColor, '│')} ${padCell(lifecycle, innerWidth)} ${colorize(borderColor, '│')}`,
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
  const deploymentCards = selectDeploymentsForDisplay(state.deployments);
  const deployments =
    deploymentCards.length > 0
      ? buildDeploymentTable(deploymentCards, {
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
  const activePendingDeployment = state.deployments?.[0];
  const lastDeployDetails = [formatRelativeTime(state.lastDeployAt, { now })];
  const failureLines = getResultErrorLines(state.lastResult);

  if (
    activePendingDeployment &&
    (state.lastDeployStatus === 'deploying' ||
      state.lastDeployStatus === 'building')
  ) {
    const elapsedMs = getDeploymentElapsedMs(activePendingDeployment, { now });

    if (elapsedMs != null) {
      lastDeployDetails.push(`${formatDuration(elapsedMs)} elapsed`);
    }
  }

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
    ...(failureLines.length > 0
      ? [
          formatRow(
            'Failure',
            colorize('red', truncateText(failureLines[0], contentWidth - 18))
          ),
          ...failureLines
            .slice(1, 3)
            .map((line, index) =>
              formatRow(
                index === 0 ? 'Detail' : 'Detail+',
                colorize('dim', truncateText(line, contentWidth - 18))
              )
            ),
        ]
      : []),
    formatRow(
      'Blue/green',
      summarizeBlueGreenRuntime(state.currentBlueGreen, { now })
    ),
    formatRow('Docker', summarizeDockerResources(state.dockerResources)),
    formatRow('Containers', summarizeDockerContainers(state.dockerResources)),
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
      'Last deploy',
      state.lastDeployAt
        ? `${colorize(
            state.lastDeployStatus === 'failed'
              ? 'red'
              : state.lastDeployStatus === 'deploying'
                ? 'cyan'
                : state.lastDeployStatus === 'building'
                  ? 'magenta'
                  : 'green',
            state.lastDeployStatus === 'failed'
              ? 'failed'
              : state.lastDeployStatus === 'deploying'
                ? 'deploying'
                : state.lastDeployStatus === 'building'
                  ? 'building'
                  : 'successful'
          )} ${colorize('dim', `(${lastDeployDetails.join(' · ')})`)}`
        : colorize('dim', 'none yet')
    ),
    formatRow('Lock file', state.lockFile ?? colorize('dim', 'not acquired')),
    '',
    separator,
    colorize('bold', `Top ${DISPLAY_DEPLOYMENTS} Deployments`),
    colorize(
      'dim',
      'Showing the most relevant cards first: in-progress rollout, live traffic, then warm standby.'
    ),
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

function hasPendingDeployRequest(env = process.env) {
  return env[WATCH_PENDING_DEPLOY_ENV] === '1';
}

function readPendingDeployRequest(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.pendingDeployFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.pendingDeployFile, 'utf8')
    );
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function writePendingDeployRequest(
  request,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.pendingDeployFile,
    JSON.stringify(request, null, 2),
    'utf8'
  );
}

function clearPendingDeployRequest({
  fsImpl = fs,
  paths = getWatchPaths(),
} = {}) {
  fsImpl.rmSync(paths.pendingDeployFile, { force: true });
}

function hasPersistedPendingDeployRequest(
  env = process.env,
  { fsImpl = fs, paths = getWatchPaths() } = {}
) {
  return (
    hasPendingDeployRequest(env) ||
    readPendingDeployRequest(paths, fsImpl) != null
  );
}

function getLatestSuccessfulDeploymentCommitHash(deployments = []) {
  const latestSuccessfulDeployment = deployments.find(
    (entry) =>
      entry?.status === 'successful' &&
      typeof entry.commitHash === 'string' &&
      entry.commitHash.length > 0
  );

  return latestSuccessfulDeployment?.commitHash ?? null;
}

function createWatchUi(initialState = {}, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const now = options.now ?? (() => Date.now());
  const onStateChange = options.onStateChange ?? null;
  const refreshIntervalMs = options.refreshIntervalMs ?? 1_000;
  const setIntervalImpl = options.setIntervalImpl ?? setInterval;
  const clearIntervalImpl = options.clearIntervalImpl ?? clearInterval;
  const isTTY = options.isTTY ?? Boolean(stdout.isTTY);
  const maxEvents = options.maxEvents ?? MAX_EVENTS;
  const onEvent = options.onEvent ?? null;
  const state = {
    deployments: [],
    events: [],
    intervalMs: DEFAULT_INTERVAL_MS,
    lastResult: null,
    ...initialState,
  };
  let cursorHidden = false;
  let closed = false;
  let refreshTimer = null;

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

  function emitStateChange() {
    onStateChange?.(state);
  }

  function start() {
    if (isTTY && !cursorHidden) {
      stdout.write('\x1b[?25l');
      cursorHidden = true;
      render();
    }

    if (isTTY && refreshIntervalMs > 0 && !refreshTimer) {
      refreshTimer = setIntervalImpl(() => {
        render();
      }, refreshIntervalMs);
    }

    emitStateChange();
  }

  function pushEvent(level, message) {
    const event = {
      level,
      message,
      time: now(),
    };
    state.events = [event, ...state.events].slice(0, maxEvents);
    onEvent?.(event, state);

    if (!isTTY) {
      const writer = level === 'error' ? stderr : stdout;
      writer.write(`[auto-deploy] ${message}\n`);
    }

    render();
    emitStateChange();
  }

  function update(patch) {
    Object.assign(state, patch);
    render();
    emitStateChange();
  }

  function close() {
    if (closed) {
      return;
    }

    closed = true;

    if (refreshTimer) {
      clearIntervalImpl(refreshTimer);
      refreshTimer = null;
    }

    if (isTTY) {
      render();
      stdout.write(`\n\x1b[?25h`);
      cursorHidden = false;
    }

    emitStateChange();
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

function readWatchStatus(paths = getWatchPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.statusFile)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(paths.statusFile, 'utf8'));
  } catch {
    return null;
  }
}

function serializeWatchStatus(
  state,
  { now = Date.now(), processImpl = process } = {}
) {
  const { logs: _logs, ...serializableState } = state;

  return {
    ...serializableState,
    lastResult:
      serializableState.lastResult == null
        ? null
        : {
            ...serializableState.lastResult,
            error:
              serializableState.lastResult.error instanceof Error
                ? serializableState.lastResult.error.message
                : (serializableState.lastResult.error ?? null),
          },
    ownerPid: processImpl.pid,
    updatedAt: now,
  };
}

function writeWatchStatus(
  state,
  {
    fsImpl = fs,
    now = Date.now(),
    paths = getWatchPaths(),
    processImpl = process,
  } = {}
) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
  fsImpl.writeFileSync(
    paths.statusFile,
    JSON.stringify(serializeWatchStatus(state, { now, processImpl }), null, 2),
    'utf8'
  );
}

function clearWatchStatus({
  fsImpl = fs,
  paths = getWatchPaths(),
  processImpl = process,
} = {}) {
  const status = readWatchStatus(paths, fsImpl);

  if (!status || status.ownerPid !== processImpl.pid) {
    return;
  }

  fsImpl.rmSync(paths.statusFile, { force: true });
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

function getRuntimeDeployment(deployments, runtimeState) {
  return (deployments ?? []).find(
    (entry) => entry.runtimeState === runtimeState
  );
}

function getStandbyRefreshCandidate(
  runtimeSnapshot,
  latestCommit,
  { now = Date.now(), refreshAfterMs = DEFAULT_STANDBY_REFRESH_AFTER_MS } = {}
) {
  const activeDeployment = getRuntimeDeployment(
    runtimeSnapshot?.deployments,
    'active'
  );

  if (
    !runtimeSnapshot?.currentBlueGreen?.activeColor ||
    !latestCommit?.hash ||
    !activeDeployment?.activatedAt
  ) {
    return null;
  }

  const standbyDeployment = getRuntimeDeployment(
    runtimeSnapshot.deployments,
    'standby'
  );
  let standbyColor =
    runtimeSnapshot.currentBlueGreen.standbyColor ??
    runtimeSnapshot.currentBlueGreen.liveColors?.find(
      (color) => color !== runtimeSnapshot.currentBlueGreen.activeColor
    ) ??
    null;

  if (!standbyColor) {
    standbyColor =
      runtimeSnapshot.currentBlueGreen.activeColor === 'blue'
        ? 'green'
        : 'blue';
  }

  if (!standbyColor) {
    return null;
  }

  if (now - activeDeployment.activatedAt < refreshAfterMs) {
    return null;
  }

  if (standbyDeployment?.commitHash === latestCommit.hash) {
    return null;
  }

  return {
    activeDeployment,
    standbyColor,
    standbyDeployment,
  };
}

function formatInstantRolloutRequester(request) {
  if (!request) {
    return 'an operator request';
  }

  return (
    request.requestedByEmail || request.requestedBy || 'an operator request'
  );
}

async function getRevision(ref, { env, runCommand: run = runCommand } = {}) {
  return gitStdout(['rev-parse', ref], { env, runCommand: run });
}

function isRecoverableGitCommandError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /Command failed \(\d+\): git\b/.test(message);
}

function getGitFailureBackoffMs(
  failureCount,
  {
    baseMs = DEFAULT_GIT_FAILURE_BACKOFF_MS,
    maxMs = MAX_GIT_FAILURE_BACKOFF_MS,
  } = {}
) {
  if (!Number.isFinite(failureCount) || failureCount <= 0) {
    return baseMs;
  }

  return Math.min(maxMs, baseMs * 2 ** Math.max(0, failureCount - 1));
}

function parseDirtyWorktreePaths(statusOutput) {
  return statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .flatMap((line) => {
      const pathSpec = line.slice(3).trim();

      if (!pathSpec) {
        return [];
      }

      if (!pathSpec.includes(' -> ')) {
        return [pathSpec];
      }

      return pathSpec
        .split(' -> ')
        .map((value) => value.trim())
        .filter(Boolean);
    });
}

async function listDirtyWorktreePaths({
  env,
  runCommand: run = runCommand,
} = {}) {
  const result = await runChecked('git', ['status', '--porcelain'], {
    env,
    runCommand: run,
    stdio: 'pipe',
  });
  const status = result.stdout.replace(/\s+$/, '');

  return parseDirtyWorktreePaths(status);
}

async function hasDirtyWorktree({
  env,
  ignoredPaths = [],
  runCommand: run = runCommand,
} = {}) {
  const dirtyPaths = await listDirtyWorktreePaths({
    env,
    runCommand: run,
  });
  const ignored = new Set(ignoredPaths);

  return dirtyPaths.some((value) => !ignored.has(value));
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
    env: {
      ...(env ?? process.env),
      [SKIP_WATCH_HISTORY_ENV]: '1',
    },
    runCommand: run,
  });
}

async function runBunUpgradeAndInstall({
  env,
  runCommand: run = runCommand,
} = {}) {
  await runChecked('bun', ['upgrade'], {
    env,
    runCommand: run,
  });
  await runChecked('bun', ['i'], {
    env,
    runCommand: run,
  });
}

async function runBlueGreenStandbyRefresh({
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  return runBlueGreenStandbyRefreshWorkflow(
    {
      action: 'up',
      composeArgs: [],
      composeGlobalArgs: ['--profile', 'redis'],
      mode: 'prod',
      strategy: 'blue-green',
    },
    {
      env,
      envFilePath,
      fsImpl,
      rootDir,
      runCommand: run,
    }
  );
}

async function runPendingDeployAfterRestart({
  deployCommand = DEFAULT_DEPLOY_COMMAND,
  env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
  latestCommit,
  log = console,
  now = () => Date.now(),
  paths = getWatchPaths(),
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const refreshedProxy = await refreshBlueGreenProxyIfRunning({
    env,
    envFilePath,
    fsImpl,
    paths: paths.blueGreen,
    rootDir,
    runCommand: run,
  });

  log.info?.(
    refreshedProxy
      ? 'Refreshed live blue/green proxy config before deployment.'
      : 'No live blue/green proxy was running; skipping proxy refresh.'
  );

  const deployStartedAt = now();
  await runBlueGreenDeploy({
    deployCommand,
    env,
    runCommand: run,
  });
  const deployFinishedAt = now();
  const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
  const deploymentStamp = readBlueGreenDeploymentStamp(paths.blueGreen, fsImpl);
  const history = appendDeploymentHistory(
    {
      activatedAt: deployFinishedAt,
      activeColor,
      buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
      commitHash: latestCommit.hash,
      commitShortHash: latestCommit.shortHash,
      commitSubject: latestCommit.subject,
      deploymentStamp,
      finishedAt: deployFinishedAt,
      startedAt: deployStartedAt,
      status: 'successful',
    },
    {
      fsImpl,
      paths,
    }
  );

  return {
    activeColor,
    buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
    deployFinishedAt,
    deployStartedAt,
    history,
    refreshedProxy,
  };
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

async function waitForProcessExit(
  pid,
  {
    pollMs = 100,
    processImpl = process,
    sleepImpl = sleep,
    timeoutMs = DEFAULT_REPLACE_WATCHER_TIMEOUT_MS,
  } = {}
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    if (!isProcessAlive(pid, processImpl)) {
      return true;
    }

    await sleepImpl(pollMs);
  }

  return !isProcessAlive(pid, processImpl);
}

async function terminateExistingWatcher(
  existingLock,
  {
    processImpl = process,
    sleepImpl = sleep,
    timeoutMs = DEFAULT_REPLACE_WATCHER_TIMEOUT_MS,
  } = {}
) {
  if (!existingLock?.pid || !isProcessAlive(existingLock.pid, processImpl)) {
    return false;
  }

  processImpl.kill(existingLock.pid, 'SIGTERM');
  const exitedGracefully = await waitForProcessExit(existingLock.pid, {
    processImpl,
    sleepImpl,
    timeoutMs,
  });

  if (exitedGracefully) {
    return true;
  }

  processImpl.kill(existingLock.pid, 'SIGKILL');
  return waitForProcessExit(existingLock.pid, {
    processImpl,
    sleepImpl,
    timeoutMs: Math.min(timeoutMs, 1_000),
  });
}

async function mirrorExistingWatchSession(
  existingLock,
  {
    env,
    envFilePath,
    fsImpl = fs,
    log,
    now = () => Date.now(),
    once = false,
    paths = getWatchPaths(),
    processImpl = process,
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
    sleepImpl = sleep,
  } = {}
) {
  const ui = log;

  ui.start();
  ui.info(
    `Resuming watcher view for PID ${existingLock.pid} on ${existingLock.branch} (${existingLock.upstreamRef}).`
  );

  while (true) {
    const status = readWatchStatus(paths, fsImpl);

    if (status) {
      ui.update({
        ...status,
        lockFile: paths.lockFile,
      });
    } else {
      const runtimeSnapshot = await loadRuntimeSnapshot({
        env,
        envFilePath,
        fsImpl,
        now: now(),
        paths,
        rootDir,
        runCommand: run,
      });
      const deploymentSummary = getLatestDeploymentSummary(
        runtimeSnapshot.deployments
      );

      ui.update({
        currentBlueGreen: runtimeSnapshot.currentBlueGreen,
        deployments: runtimeSnapshot.deployments,
        lastDeployAt: deploymentSummary.lastDeployAt,
        lastDeployStatus: deploymentSummary.lastDeployStatus,
        lockFile: paths.lockFile,
        target: existingLock,
      });
    }

    if (once) {
      return {
        resumedPid: existingLock.pid,
        status: readWatchStatus(paths, fsImpl),
      };
    }

    const activeLock = readWatchLock(paths, fsImpl);
    if (
      !activeLock ||
      activeLock.pid !== existingLock.pid ||
      !isProcessAlive(existingLock.pid, processImpl)
    ) {
      ui.info(`Watcher PID ${existingLock.pid} is no longer active.`);
      return {
        resumedPid: existingLock.pid,
        status: 'ended',
      };
    }

    await sleepImpl(DEFAULT_INTERVAL_MS);
  }
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

  try {
    const result = await runChecked(
      'docker',
      getComposeCommandArgs(PROD_COMPOSE_FILE, [], 'ps', '-q', serviceName),
      {
        env: composeEnv,
        runCommand: run,
        stdio: 'pipe',
      }
    );
    const containerId = result.stdout.trim();

    if (containerId) {
      return containerId;
    }
  } catch {}

  try {
    const fallbackResult = await runChecked(
      'docker',
      [
        'ps',
        '--filter',
        `label=com.docker.compose.project=${path.basename(rootDir)}`,
        '--filter',
        `label=com.docker.compose.service=${serviceName}`,
        '--format',
        '{{.ID}}',
      ],
      {
        env,
        runCommand: run,
        stdio: 'pipe',
      }
    );

    return fallbackResult.stdout.trim().split('\n')[0]?.trim() ?? '';
  } catch {
    return '';
  }
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
  const serviceStates = {};

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

    for (const color of BLUE_GREEN_COLORS) {
      serviceStates[color] = await getProdComposeServiceContainerId(
        `web-${color}`,
        {
          env,
          envFilePath,
          fsImpl,
          rootDir,
          runCommand: run,
        }
      );
    }

    const liveColors = BLUE_GREEN_COLORS.filter((color) =>
      Boolean(serviceStates[color])
    );
    const activeContainerId = activeColor ? serviceStates[activeColor] : '';
    const standbyColor =
      liveColors.find((color) => color !== activeColor) ?? null;

    return {
      activeColor,
      activeServiceRunning: Boolean(activeContainerId),
      liveColors,
      proxyRunning: Boolean(proxyContainerId),
      serviceContainers: {
        proxy: proxyContainerId,
        'web-blue': serviceStates.blue,
        'web-green': serviceStates.green,
      },
      standbyColor,
      state:
        activeColor && proxyContainerId && activeContainerId
          ? 'serving'
          : proxyContainerId || liveColors.length > 0 || activeColor
            ? 'degraded'
            : 'idle',
    };
  } catch (error) {
    return {
      activeColor,
      liveColors: [],
      message:
        error instanceof Error ? error.message : 'Unable to inspect blue/green',
      state: 'unknown',
      serviceContainers: {},
      standbyColor: null,
    };
  }
}

function parseDockerBytes(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/,/g, '.').replace(/\s+/g, ' ');
  const match = normalized.match(/^([0-9]*\.?[0-9]+)\s*([KMGT]?i?B)$/iu);

  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = match[2].toUpperCase();
  const base = unit.includes('IB') ? 1024 : 1000;
  const exponent = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4,
    KIB: 1,
    MIB: 2,
    GIB: 3,
    TIB: 4,
  }[unit];

  if (exponent == null) {
    return null;
  }

  return amount * base ** exponent;
}

function parseDockerIoPair(value) {
  if (typeof value !== 'string') {
    return { rxBytes: null, txBytes: null };
  }

  const [rxRaw = '', txRaw = ''] = value.split('/');
  return {
    rxBytes: parseDockerBytes(rxRaw),
    txBytes: parseDockerBytes(txRaw),
  };
}

function parseDockerStatsLine(line) {
  const [
    containerId = '',
    cpuRaw = '',
    memoryUsage = '',
    netIo = '',
    name = '',
  ] = String(line).split('\t');
  const cpuPercent = Number.parseFloat(
    String(cpuRaw).replace('%', '').replace(/,/g, '.').trim()
  );
  const [memoryRaw = ''] = String(memoryUsage).split('/');
  const { rxBytes, txBytes } = parseDockerIoPair(netIo);

  return {
    containerId: containerId.trim(),
    cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : null,
    memoryBytes: parseDockerBytes(memoryRaw),
    name: name.trim(),
    rxBytes,
    txBytes,
  };
}

function parseDockerHealthFromStatus(status) {
  if (typeof status !== 'string' || status.trim().length === 0) {
    return 'unknown';
  }

  const normalized = status.toLowerCase();

  if (normalized.includes('(healthy)')) {
    return 'healthy';
  }

  if (normalized.includes('(unhealthy)')) {
    return 'unhealthy';
  }

  if (normalized.includes('(health: starting)')) {
    return 'starting';
  }

  return normalized.startsWith('up') ? 'none' : 'unknown';
}

function parseDockerPsLine(line) {
  const [
    containerId = '',
    name = '',
    image = '',
    status = '',
    runningFor = '',
    ports = '',
    serviceName = '',
    projectName = '',
  ] = String(line).split('\t');

  return {
    containerId: containerId.trim(),
    health: parseDockerHealthFromStatus(status),
    image: image.trim() || null,
    name: name.trim(),
    ports: ports.trim() || null,
    projectName: projectName.trim() || null,
    runningFor: runningFor.trim() || null,
    serviceName: serviceName.trim() || null,
    status: status.trim() || null,
  };
}

async function listRunningDockerContainers({ env, runCommand: run }) {
  const result = await runChecked(
    'docker',
    [
      'ps',
      '--format',
      '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.RunningFor}}\t{{.Ports}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}',
    ],
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseDockerPsLine)
    .filter((container) => container.containerId && container.name);
}

async function collectDockerResources(
  currentBlueGreen,
  { env, rootDir = ROOT_DIR, runCommand: run = runCommand } = {}
) {
  const monitoredContainers = Object.entries(
    currentBlueGreen?.serviceContainers ?? {}
  )
    .filter(
      ([, containerId]) =>
        typeof containerId === 'string' && containerId.length > 0
    )
    .map(([serviceName, containerId]) => ({
      containerId,
      label:
        serviceName === 'web-green'
          ? 'green'
          : serviceName === 'web-blue'
            ? 'blue'
            : serviceName === 'proxy'
              ? 'proxy'
              : serviceName,
      color:
        serviceName === 'web-green'
          ? 'green'
          : serviceName === 'web-blue'
            ? 'blue'
            : 'cyan',
      serviceName,
    }));

  let runningContainers = [];

  try {
    runningContainers = await listRunningDockerContainers({
      env,
      runCommand: run,
    });
  } catch {}

  const statsContainerIds = [
    ...new Set(
      [
        ...monitoredContainers.map((container) => container.containerId),
        ...runningContainers.map((container) => container.containerId),
      ].filter(Boolean)
    ),
  ];

  if (statsContainerIds.length === 0) {
    return {
      allContainers: [],
      containers: [],
      serviceHealth: [],
      state: 'idle',
      totalCpuPercent: 0,
      totalMemoryBytes: 0,
      totalRxBytes: 0,
      totalTxBytes: 0,
    };
  }

  try {
    const result = await runChecked(
      'docker',
      [
        'stats',
        '--no-stream',
        '--format',
        '{{.ID}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.Name}}',
        ...statsContainerIds,
      ],
      {
        env,
        runCommand: run,
        stdio: 'pipe',
      }
    );

    const statsById = new Map(
      result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parsed = parseDockerStatsLine(line);
          return [parsed.containerId, parsed];
        })
    );

    const resourceContainers = monitoredContainers
      .map((container) => {
        const stats = statsById.get(container.containerId);
        if (!stats) {
          return null;
        }

        return {
          ...container,
          cpuPercent: stats.cpuPercent,
          memoryBytes: stats.memoryBytes,
          rxBytes: stats.rxBytes,
          txBytes: stats.txBytes,
        };
      })
      .filter(Boolean);
    const monitoredContainerIds = new Set(
      monitoredContainers.map((container) => container.containerId)
    );
    const projectName = path.basename(rootDir);
    const allContainers = runningContainers.map((container) => {
      const stats = statsById.get(container.containerId);

      return {
        ...container,
        cpuPercent: stats?.cpuPercent ?? null,
        isMonitored: monitoredContainerIds.has(container.containerId),
        memoryBytes: stats?.memoryBytes ?? null,
        rxBytes: stats?.rxBytes ?? null,
        txBytes: stats?.txBytes ?? null,
      };
    });
    const serviceHealth = allContainers
      .filter(
        (container) =>
          container.projectName === projectName && container.serviceName
      )
      .map((container) => ({
        containerId: container.containerId,
        health: container.health,
        name: container.name,
        projectName: container.projectName,
        serviceName: container.serviceName,
        status: container.status,
      }))
      .sort((a, b) => a.serviceName.localeCompare(b.serviceName));

    return {
      allContainers,
      containers: resourceContainers,
      serviceHealth,
      state: 'live',
      totalCpuPercent: resourceContainers.reduce(
        (sum, container) =>
          sum +
          (Number.isFinite(container.cpuPercent) ? container.cpuPercent : 0),
        0
      ),
      totalMemoryBytes: resourceContainers.reduce(
        (sum, container) =>
          sum +
          (Number.isFinite(container.memoryBytes) ? container.memoryBytes : 0),
        0
      ),
      totalRxBytes: resourceContainers.reduce(
        (sum, container) =>
          sum + (Number.isFinite(container.rxBytes) ? container.rxBytes : 0),
        0
      ),
      totalTxBytes: resourceContainers.reduce(
        (sum, container) =>
          sum + (Number.isFinite(container.txBytes) ? container.txBytes : 0),
        0
      ),
    };
  } catch (error) {
    return {
      allContainers: runningContainers.map((container) => ({
        ...container,
        cpuPercent: null,
        isMonitored: false,
        memoryBytes: null,
        rxBytes: null,
        txBytes: null,
      })),
      containers: [],
      message:
        error instanceof Error
          ? error.message
          : 'Unable to inspect docker stats',
      serviceHealth: [],
      state: 'unavailable',
      totalCpuPercent: 0,
      totalMemoryBytes: 0,
      totalRxBytes: 0,
      totalTxBytes: 0,
    };
  }
}

async function collectDeploymentTraffic(
  deployments,
  {
    env,
    envFilePath = WEB_ENV_FILE,
    fsImpl = fs,
    now = Date.now(),
    paths = getWatchPaths(),
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
  } = {}
) {
  const successfulDeployments = deployments.filter(
    (entry) => entry.status === 'successful' && entry.activatedAt
  );
  const telemetrySummary = readTelemetrySummary(paths, fsImpl);

  if (
    successfulDeployments.length === 0 &&
    (telemetrySummary?.totalLogEntries ?? 0) === 0
  ) {
    return enrichDeploymentsWithTelemetry(deployments, telemetrySummary, {
      now,
    });
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
    if (successfulDeployments.length > 0 || containerId) {
      await syncProxyTrafficStore(deployments, {
        containerId,
        env,
        fsImpl,
        now,
        paths,
        runChecked,
        runCommand: run,
      });
    }

    return enrichDeploymentsWithTelemetry(
      deployments,
      readTelemetrySummary(paths, fsImpl),
      { now }
    );
  } catch {
    return enrichDeploymentsWithTelemetry(
      deployments,
      readTelemetrySummary(paths, fsImpl),
      { now }
    );
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
  const dockerResources = await collectDockerResources(currentBlueGreen, {
    env,
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
  const liveColors = new Set(currentBlueGreen.liveColors ?? []);
  const latestLiveCommitByColor = new Map();

  for (const entry of deployments) {
    if (
      entry.status !== 'successful' ||
      typeof entry.activeColor !== 'string' ||
      !liveColors.has(entry.activeColor) ||
      latestLiveCommitByColor.has(entry.activeColor)
    ) {
      continue;
    }

    latestLiveCommitByColor.set(
      entry.activeColor,
      entry.commitHash ??
        `${entry.activeColor}:${entry.activatedAt ?? entry.finishedAt ?? entry.startedAt ?? 'unknown'}`
    );
  }

  const runtimeAwareDeployments = deployments.map((entry) => {
    const isLive =
      entry.status === 'successful' &&
      typeof entry.activeColor === 'string' &&
      liveColors.has(entry.activeColor) &&
      latestLiveCommitByColor.get(entry.activeColor) ===
        (entry.commitHash ??
          `${entry.activeColor}:${entry.activatedAt ?? entry.finishedAt ?? entry.startedAt ?? 'unknown'}`);

    return {
      ...entry,
      lifetimeMs:
        isLive && entry.activatedAt
          ? Math.max(0, now - entry.activatedAt)
          : entry.lifetimeMs,
      runtimeState: isLive
        ? entry.activeColor === currentBlueGreen.activeColor
          ? 'active'
          : 'standby'
        : null,
    };
  });
  const activeDeployment = runtimeAwareDeployments.find(
    (entry) => entry.runtimeState === 'active'
  );

  return {
    currentBlueGreen: activeDeployment
      ? {
          ...currentBlueGreen,
          activatedAt: activeDeployment.activatedAt,
          averageRequestsPerMinute: activeDeployment.averageRequestsPerMinute,
          dailyAverageRequests: activeDeployment.dailyAverageRequests,
          dailyPeakRequests: activeDeployment.dailyPeakRequests,
          dailyRequestCount: activeDeployment.dailyRequestCount,
          lifetimeMs: activeDeployment.lifetimeMs,
          peakRequestsPerMinute: activeDeployment.peakRequestsPerMinute,
          requestCount: activeDeployment.requestCount,
        }
      : currentBlueGreen,
    dockerResources,
    deployments: runtimeAwareDeployments,
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
    onDeploymentStart = () => {},
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

  const hasBlockingDirtyWorktree = await hasDirtyWorktree({
    env,
    ignoredPaths: ['bun.lock'],
    runCommand: run,
  });

  if (hasBlockingDirtyWorktree) {
    log.warn?.(
      `Skipping poll because the worktree has uncommitted changes on ${target.branch}.`
    );
    return attachRuntime({
      checkedAt,
      status: 'dirty',
    });
  }

  try {
    await fetchTrackedBranch(target, { env, runCommand: run });

    const localHead = await getRevision('HEAD', { env, runCommand: run });
    const upstreamHead = await getRevision(target.upstreamRef, {
      env,
      runCommand: run,
    });

    if (localHead === upstreamHead) {
      const latestCommit = await getCommitMetadata('HEAD', {
        env,
        runCommand: run,
      });
      const latestDeployedCommitHash = getLatestSuccessfulDeploymentCommitHash(
        readDeploymentHistory(paths, fsImpl)
      );

      if (
        latestDeployedCommitHash &&
        latestCommit.hash &&
        latestCommit.hash !== latestDeployedCommitHash
      ) {
        log.warn?.(
          `Latest successful deployment is ${latestDeployedCommitHash ? latestDeployedCommitHash.slice(0, 12) : 'missing'}. Rebuilding ${latestCommit.shortHash} to reconcile runtime drift.`
        );
        log.info?.(
          `Refreshing Bun runtime and dependencies for ${latestCommit.shortHash} before reconciliation deploy.`
        );

        await runBunUpgradeAndInstall({
          env,
          runCommand: run,
        });

        const deployStartedAt = now();
        onDeploymentStart({
          checkedAt,
          latestCommit,
          pendingDeployment: createPendingDeploymentEntry({
            deploymentKind: 'reconcile',
            latestCommit,
            startedAt: deployStartedAt,
            status: 'building',
          }),
        });

        try {
          await runBlueGreenDeploy({
            deployCommand,
            env,
            runCommand: run,
          });

          const deployFinishedAt = now();
          const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
          const deploymentStamp = readBlueGreenDeploymentStamp(
            paths.blueGreen,
            fsImpl
          );
          const history = appendDeploymentHistory(
            {
              activatedAt: deployFinishedAt,
              activeColor,
              buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              commitSubject: latestCommit.subject,
              deploymentKind: 'reconcile',
              deploymentStamp,
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
            `Blue/green reconciliation deployment completed for ${latestCommit.shortHash}.`
          );

          return attachRuntime(
            {
              checkedAt,
              latestCommit,
              reconciledFromCommitHash: latestDeployedCommitHash,
              status: 'deployed',
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
              deploymentKind: 'reconcile',
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
            `Blue/green reconciliation deployment failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
          );

          return attachRuntime(
            {
              checkedAt,
              error,
              latestCommit,
              reconciledFromCommitHash: latestDeployedCommitHash,
              status: 'deploy-failed',
            },
            history
          );
        }
      }

      const runtimeSnapshot = await attachRuntime({
        checkedAt,
        latestCommit,
        status: 'up-to-date',
      });
      const instantRolloutRequest = readInstantRolloutRequest(paths, fsImpl);
      const standbyRefreshCandidate = getStandbyRefreshCandidate(
        runtimeSnapshot,
        latestCommit,
        {
          now: checkedAt,
          refreshAfterMs: instantRolloutRequest ? 0 : undefined,
        }
      );

      if (!standbyRefreshCandidate) {
        if (instantRolloutRequest) {
          clearInstantRolloutRequest({
            fsImpl,
            paths,
          });

          const standbyDeployment = getRuntimeDeployment(
            runtimeSnapshot.deployments,
            'standby'
          );

          if (
            standbyDeployment?.commitHash &&
            latestCommit.hash &&
            standbyDeployment.commitHash === latestCommit.hash
          ) {
            log.info?.(
              `Ignoring instant standby sync from ${formatInstantRolloutRequester(instantRolloutRequest)} because the standby deployment already matches ${latestCommit.shortHash}.`
            );
          } else {
            log.warn?.(
              `Ignoring instant standby sync from ${formatInstantRolloutRequester(instantRolloutRequest)} because the blue/green runtime is not ready for a standby refresh.`
            );
          }
        }

        return runtimeSnapshot;
      }

      log.info?.(
        instantRolloutRequest
          ? `Refreshing standby ${standbyRefreshCandidate.standbyColor} to ${latestCommit.shortHash} immediately for ${formatInstantRolloutRequester(instantRolloutRequest)}.`
          : `Refreshing standby ${standbyRefreshCandidate.standbyColor} to ${latestCommit.shortHash} after the 15 minute stale window.`
      );

      const refreshStartedAt = now();
      onDeploymentStart({
        checkedAt,
        latestCommit,
        pendingDeployment: createPendingDeploymentEntry({
          activeColor: standbyRefreshCandidate.standbyColor,
          deploymentKind: 'standby-refresh',
          latestCommit,
          startedAt: refreshStartedAt,
          status: 'building',
        }),
      });

      try {
        await runBlueGreenStandbyRefresh({
          env,
          envFilePath,
          fsImpl,
          rootDir,
          runCommand: run,
        });

        const refreshFinishedAt = now();
        const deploymentStamp = readBlueGreenDeploymentStamp(
          paths.blueGreen,
          fsImpl
        );
        const history = appendDeploymentHistory(
          {
            activatedAt: refreshFinishedAt,
            activeColor: standbyRefreshCandidate.standbyColor,
            buildDurationMs: Math.max(0, refreshFinishedAt - refreshStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            deploymentKind: 'standby-refresh',
            deploymentStamp,
            finishedAt: refreshFinishedAt,
            startedAt: refreshStartedAt,
            status: 'successful',
          },
          {
            fsImpl,
            paths,
          }
        );

        log.info?.(
          `Standby ${standbyRefreshCandidate.standbyColor} now matches ${latestCommit.shortHash}.`
        );

        if (instantRolloutRequest) {
          clearInstantRolloutRequest({
            fsImpl,
            paths,
          });
        }

        return attachRuntime(
          {
            checkedAt,
            latestCommit,
            status: 'standby-refreshed',
          },
          history
        );
      } catch (error) {
        const refreshFinishedAt = now();
        const history = appendDeploymentHistory(
          {
            activeColor: standbyRefreshCandidate.standbyColor,
            buildDurationMs: Math.max(0, refreshFinishedAt - refreshStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            deploymentKind: 'standby-refresh',
            finishedAt: refreshFinishedAt,
            startedAt: refreshStartedAt,
            status: 'failed',
          },
          {
            fsImpl,
            paths,
          }
        );

        log.error?.(
          `Standby ${standbyRefreshCandidate.standbyColor} refresh failed for ${latestCommit.shortHash}: ${error instanceof Error ? error.message : String(error)}`
        );

        if (instantRolloutRequest) {
          clearInstantRolloutRequest({
            fsImpl,
            paths,
          });
        }

        return attachRuntime(
          {
            checkedAt,
            error,
            latestCommit,
            status: 'standby-refresh-failed',
          },
          history
        );
      }
    }

    if (await isAncestor(localHead, upstreamHead, { env, runCommand: run })) {
      await pullTrackedBranch(target, { env, runCommand: run });

      const updatedHead = await getRevision('HEAD', { env, runCommand: run });

      if (updatedHead === localHead) {
        return attachRuntime({
          checkedAt,
          latestCommit: await getCommitMetadata('HEAD', {
            env,
            runCommand: run,
          }),
          status: 'up-to-date',
        });
      }

      const containerRefreshRequired = await hasWatchedScriptChanges(
        localHead,
        updatedHead,
        {
          env,
          relativePaths: CONTAINER_REFRESH_WATCHED_FILES,
          runCommand: run,
        }
      );
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
        )} to ${updatedHead.slice(0, 12)}.`
      );

      log.info?.(
        `Refreshing Bun runtime and dependencies for ${updatedHead.slice(0, 12)}.`
      );

      await runBunUpgradeAndInstall({
        env,
        runCommand: run,
      });

      const deployStartedAt = now();
      onDeploymentStart({
        checkedAt,
        latestCommit,
        pendingDeployment: createPendingDeploymentEntry({
          latestCommit,
          startedAt: deployStartedAt,
          status: 'deploying',
        }),
      });

      try {
        if (containerRefreshRequired) {
          writePendingDeployRequest(
            {
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              reason: 'container-refresh',
              requestedAt: new Date(checkedAt).toISOString(),
            },
            {
              fsImpl,
              paths,
            }
          );
          log.warn?.(
            'Watcher container runtime changed in the pulled revision. Recreating the watcher container before deployment.'
          );

          return attachRuntime({
            checkedAt,
            containerRefreshRequired,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            restartRequired: false,
            status: 'restarting',
          });
        }

        if (restartRequired) {
          writePendingDeployRequest(
            {
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              reason: 'process-restart',
              requestedAt: new Date(checkedAt).toISOString(),
            },
            {
              fsImpl,
              paths,
            }
          );
          log.warn?.(
            'Watcher script changed in the pulled revision. Restarting watcher before deployment.'
          );

          return attachRuntime({
            checkedAt,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            containerRefreshRequired: false,
            restartRequired,
            status: 'restarting',
          });
        }

        log.info?.(
          `Starting blue/green deployment for ${updatedHead.slice(0, 12)}.`
        );

        await runBlueGreenDeploy({
          deployCommand,
          env,
          runCommand: run,
        });

        const deployFinishedAt = now();
        const activeColor = readBlueGreenActiveColor(paths.blueGreen, fsImpl);
        const deploymentStamp = readBlueGreenDeploymentStamp(
          paths.blueGreen,
          fsImpl
        );
        const history = appendDeploymentHistory(
          {
            activatedAt: deployFinishedAt,
            activeColor,
            buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            deploymentStamp,
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

        return attachRuntime(
          {
            checkedAt,
            containerRefreshRequired: false,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            restartRequired: false,
            status: 'deployed',
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

        return attachRuntime(
          {
            checkedAt,
            containerRefreshRequired: false,
            error,
            latestCommit,
            newHead: updatedHead,
            oldHead: localHead,
            restartRequired: false,
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
  } catch (error) {
    if (!isRecoverableGitCommandError(error)) {
      throw error;
    }

    log.warn?.(
      `Git polling failed on ${target.branch}: ${error instanceof Error ? error.message : String(error)}`
    );

    let latestCommit = null;
    try {
      latestCommit = await getCommitMetadata('HEAD', {
        env,
        runCommand: run,
      });
    } catch {}

    return attachRuntime({
      checkedAt,
      error,
      latestCommit,
      status: 'git-failed',
    });
  }
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
    onDeploymentStart = () => {},
    onIterationResult = () => {},
    onIterationStart = () => {},
    paths = getWatchPaths(),
    rootDir = ROOT_DIR,
    runCommand: run = runCommand,
    sleepImpl = sleep,
  } = {}
) {
  let consecutiveGitFailures = 0;

  while (true) {
    const startedAt = now();
    onIterationStart(startedAt);

    const iterationResult = await runDeployWatchIteration(target, {
      deployCommand,
      env,
      envFilePath,
      fsImpl,
      log,
      now,
      onDeploymentStart,
      paths,
      rootDir,
      runCommand: run,
    });
    const isGitFailure = iterationResult.status === 'git-failed';
    consecutiveGitFailures = isGitFailure ? consecutiveGitFailures + 1 : 0;
    const sleepMs = isGitFailure
      ? getGitFailureBackoffMs(consecutiveGitFailures)
      : intervalMs;
    const result = {
      ...iterationResult,
      gitFailureCount: isGitFailure ? consecutiveGitFailures : 0,
      sleepMs,
    };

    if (isGitFailure) {
      log.warn?.(
        `Retrying Git poll in ${formatDuration(sleepMs)} after ${result.gitFailureCount} consecutive failure${result.gitFailureCount === 1 ? '' : 's'}.`
      );
    }

    onIterationResult(result);

    if (once || result.containerRefreshRequired || result.restartRequired) {
      return result;
    }

    await sleepImpl(sleepMs);
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
    createWatchUi(
      {
        currentBlueGreen: initialRuntimeSnapshot.currentBlueGreen,
        dockerResources: initialRuntimeSnapshot.dockerResources,
        deployments: initialRuntimeSnapshot.deployments,
        logs: readWatcherLogEntries(paths, fsImpl),
        intervalMs: parsed.intervalMs,
        lastDeployAt: initialDeploymentSummary.lastDeployAt,
        lastDeployStatus: initialDeploymentSummary.lastDeployStatus,
        lockFile: paths.lockFile,
        startedAt: Date.now(),
      },
      {
        onEvent: (event, state) => {
          const nextLogs = appendWatcherLogEntry(
            createWatcherLogEntry(event, state),
            {
              fsImpl,
              paths,
            }
          );
          state.logs = nextLogs;
        },
        onStateChange: (state) => {
          writeWatchStatus(state, {
            fsImpl,
            now: Date.now(),
            paths,
            processImpl,
          });
        },
      }
    );
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
    clearWatchStatus({
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
    const existingLock = readWatchLock(paths, fsImpl);

    if (existingLock && isProcessAlive(existingLock.pid, processImpl)) {
      if (parsed.lockConflictAction === 'resume') {
        await mirrorExistingWatchSession(existingLock, {
          env,
          envFilePath,
          fsImpl,
          log: ui,
          now: options.now ?? (() => Date.now()),
          once: parsed.once,
          paths,
          processImpl,
          rootDir,
          runCommand: run,
          sleepImpl: options.sleepImpl ?? sleep,
        });
        return;
      }

      if (parsed.lockConflictAction === 'replace') {
        ui.warn(
          `Replacing existing watcher PID ${existingLock.pid} on ${existingLock.branch}.`
        );
        const terminated = await terminateExistingWatcher(existingLock, {
          processImpl,
          sleepImpl: options.sleepImpl ?? sleep,
        });

        if (!terminated) {
          throw new Error(
            `Unable to stop existing watcher PID ${existingLock.pid}.`
          );
        }
      }
    }

    try {
      acquireWatchLock(target, {
        fsImpl,
        paths,
        processImpl,
      });
    } catch (error) {
      if (parsed.lockConflictAction === 'fail' && error instanceof Error) {
        error.message = `${error.message} Re-run with --resume-if-running to mirror the existing session or --replace-existing to stop it and take over.`;
      }

      throw error;
    }

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

    if (
      hasPersistedPendingDeployRequest(env, {
        fsImpl,
        paths,
      })
    ) {
      const latestDeployedCommitHash = getLatestSuccessfulDeploymentCommitHash(
        readDeploymentHistory(paths, fsImpl)
      );

      if (latestCommit.hash && latestCommit.hash === latestDeployedCommitHash) {
        clearPendingDeployRequest({
          fsImpl,
          paths,
        });
        ui.info(
          `Recovered watcher is already serving ${latestCommit.shortHash}; skipping the pending deploy handoff.`
        );
      } else {
        const pendingStartedAt =
          typeof options.now === 'function' ? options.now() : Date.now();
        const buildingDeployment = createPendingDeploymentEntry({
          latestCommit,
          startedAt: pendingStartedAt,
          status: 'building',
        });
        const buildingDeployments = prependPendingDeployment(
          ui.state.deployments,
          buildingDeployment
        );
        const buildingSummary = getLatestDeploymentSummary(buildingDeployments);

        ui.update({
          dockerResources: ui.state.dockerResources,
          deployments: buildingDeployments,
          lastDeployAt: buildingSummary.lastDeployAt,
          lastDeployStatus: buildingSummary.lastDeployStatus,
          nextCheckAt: null,
        });

        try {
          const pendingResult = await runPendingDeployAfterRestart({
            deployCommand: options.deployCommand ?? DEFAULT_DEPLOY_COMMAND,
            env,
            envFilePath,
            fsImpl,
            latestCommit,
            log: ui,
            now: options.now ?? (() => Date.now()),
            paths,
            rootDir,
            runCommand: run,
          });
          const runtimeSnapshot = await loadRuntimeSnapshot({
            env,
            envFilePath,
            fsImpl,
            now: typeof options.now === 'function' ? options.now() : Date.now(),
            paths,
            rootDir,
            runCommand: run,
            history: pendingResult.history,
          });
          const latestDeploymentSummary = getLatestDeploymentSummary(
            runtimeSnapshot.deployments
          );

          ui.update({
            currentBlueGreen: runtimeSnapshot.currentBlueGreen,
            dockerResources: runtimeSnapshot.dockerResources,
            deployments: runtimeSnapshot.deployments,
            lastDeployAt: latestDeploymentSummary.lastDeployAt,
            lastDeployStatus: latestDeploymentSummary.lastDeployStatus,
            lastResult: { status: 'deployed' },
            nextCheckAt: Date.now() + parsed.intervalMs,
          });
          clearPendingDeployRequest({
            fsImpl,
            paths,
          });
          ui.info(
            `Blue/green deployment completed for ${latestCommit.shortHash}.`
          );
        } catch (error) {
          const deployFinishedAt =
            typeof options.now === 'function' ? options.now() : Date.now();
          const history = appendDeploymentHistory(
            {
              buildDurationMs: Math.max(0, deployFinishedAt - pendingStartedAt),
              commitHash: latestCommit.hash,
              commitShortHash: latestCommit.shortHash,
              commitSubject: latestCommit.subject,
              finishedAt: deployFinishedAt,
              startedAt: pendingStartedAt,
              status: 'failed',
            },
            {
              fsImpl,
              paths,
            }
          );
          const runtimeSnapshot = await loadRuntimeSnapshot({
            env,
            envFilePath,
            fsImpl,
            now: deployFinishedAt,
            paths,
            rootDir,
            runCommand: run,
            history,
          });
          const latestDeploymentSummary = getLatestDeploymentSummary(
            runtimeSnapshot.deployments
          );

          ui.update({
            currentBlueGreen: runtimeSnapshot.currentBlueGreen,
            dockerResources: runtimeSnapshot.dockerResources,
            deployments: runtimeSnapshot.deployments,
            lastDeployAt: latestDeploymentSummary.lastDeployAt,
            lastDeployStatus: latestDeploymentSummary.lastDeployStatus,
            lastResult: { error, status: 'deploy-failed' },
            nextCheckAt: Date.now() + parsed.intervalMs,
          });
          throw error;
        }
      }
    }

    const result = await runDeployWatchLoop(target, {
      deployCommand: options.deployCommand ?? DEFAULT_DEPLOY_COMMAND,
      env,
      envFilePath,
      fsImpl,
      intervalMs: parsed.intervalMs,
      log: ui,
      now: options.now ?? (() => Date.now()),
      once: parsed.once,
      onDeploymentStart: ({ checkedAt, latestCommit, pendingDeployment }) => {
        const currentDeployments = ui.state.deployments ?? [];
        const nextDeployments = prependPendingDeployment(
          currentDeployments,
          pendingDeployment
        );
        const latestDeploymentSummary =
          getLatestDeploymentSummary(nextDeployments);

        ui.update({
          deployments: nextDeployments,
          lastCheckAt: checkedAt ?? Date.now(),
          lastDeployAt: latestDeploymentSummary.lastDeployAt,
          lastDeployStatus: latestDeploymentSummary.lastDeployStatus,
          latestCommit: latestCommit ?? ui.state.latestCommit,
          nextCheckAt: null,
        });
      },
      onIterationResult: (iterationResult) => {
        const latestDeploymentSummary = getLatestDeploymentSummary(
          iterationResult.deployments ?? ui.state.deployments
        );
        ui.update({
          currentBlueGreen:
            iterationResult.currentBlueGreen ?? ui.state.currentBlueGreen,
          dockerResources:
            iterationResult.dockerResources ?? ui.state.dockerResources,
          deployments: iterationResult.deployments ?? ui.state.deployments,
          lastCheckAt: iterationResult.checkedAt ?? Date.now(),
          lastDeployAt:
            iterationResult.status === 'deployed' ||
            iterationResult.status === 'deploy-failed' ||
            iterationResult.status === 'standby-refreshed' ||
            iterationResult.status === 'standby-refresh-failed' ||
            iterationResult.status === 'restarting'
              ? (iterationResult.deployments?.[0]?.finishedAt ??
                iterationResult.checkedAt ??
                Date.now())
              : (ui.state.lastDeployAt ?? latestDeploymentSummary.lastDeployAt),
          lastDeployStatus:
            iterationResult.status === 'deploy-failed' ||
            iterationResult.status === 'standby-refresh-failed'
              ? 'failed'
              : iterationResult.status === 'deploying'
                ? 'deploying'
                : iterationResult.status === 'building'
                  ? 'building'
                  : iterationResult.status === 'deployed' ||
                      iterationResult.status === 'standby-refreshed' ||
                      iterationResult.status === 'restarting'
                    ? 'successful'
                    : (ui.state.lastDeployStatus ??
                      latestDeploymentSummary.lastDeployStatus),
          lastResult: iterationResult,
          latestCommit: iterationResult.latestCommit ?? ui.state.latestCommit,
          nextCheckAt:
            iterationResult.restartRequired || parsed.once
              ? null
              : Date.now() + (iterationResult.sleepMs ?? parsed.intervalMs),
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
      if (env[WATCHER_CONTAINER_ENV] === '1') {
        ui.info(
          'Watcher script changed. Restarting the containerized watcher process.'
        );
        ui.close();
        processImpl.exit?.(CONTAINER_SELF_RESTART_EXIT_CODE);
        return;
      }

      await spawnReplacementWatcher({
        argv: options.restartArgv ?? process.argv.slice(1),
        cwd: rootDir,
        env: {
          ...env,
          [WATCH_PENDING_DEPLOY_ENV]: '1',
        },
        execPath: options.execPath ?? process.execPath,
        spawnImpl: options.spawnImpl ?? spawn,
      });
      ui.close();
      return;
    }

    if (result?.containerRefreshRequired) {
      cleanup();
      if (env[WATCHER_CONTAINER_ENV] === '1') {
        ui.info(
          'Critical watcher container files changed. Recreating the containerized watcher service.'
        );
        ui.close();
        await startBlueGreenWatcherContainer(
          options.restartArgv ?? process.argv.slice(2),
          {
            env,
            envFilePath,
            fsImpl,
            rootDir,
            runCommand: options.runCommand ?? runCommand,
          }
        );
        return;
      }

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
  const entrypoint =
    process.env[WATCHER_CONTAINER_ENV] === '1' ? main : runWatcherCommand;
  void entrypoint();
}

module.exports = {
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_WATCHER_SERVICE,
  CONTAINER_SELF_RESTART_EXIT_CODE,
  DEFAULT_DEPLOY_COMMAND,
  DEFAULT_GIT_FAILURE_BACKOFF_MS,
  DEFAULT_INTERVAL_MS,
  DISPLAY_DEPLOYMENTS,
  MAX_GIT_FAILURE_BACKOFF_MS,
  MAX_DEPLOYMENTS,
  MAX_EVENTS,
  CONTAINER_REFRESH_WATCHED_FILES,
  HOST_WORKSPACE_DIR_ENV,
  SELF_WATCHED_FILES,
  WATCH_ARGS_FILE,
  WATCH_HISTORY_FILE,
  WATCH_LOCK_FILE,
  WATCH_LOG_FILE,
  WATCH_PENDING_DEPLOY_FILE,
  WATCH_PENDING_DEPLOY_ENV,
  WATCH_RUNTIME_DIR,
  WATCH_STATUS_FILE,
  WATCHER_CONTAINER_ENV,
  acquireWatchLock,
  appendDeploymentHistory,
  buildDashboardView,
  clearInstantRolloutRequest,
  clearWatchStatus,
  clearContainerManagedWatcherState,
  clearPendingDeployRequest,
  collectDeploymentTraffic,
  createWatchUi,
  fetchTrackedBranch,
  formatClockTime,
  formatCountdown,
  formatDuration,
  formatRelativeTime,
  formatRequestsPerMinute,
  getGitFailureBackoffMs,
  getLatestDeploymentSummary,
  getLatestSuccessfulDeploymentCommitHash,
  getCommitMetadata,
  getCurrentBranch,
  getProdComposeServiceContainerId,
  getRevision,
  getTrackedUpstream,
  getWatcherComposeEnv,
  getWatchPaths,
  hasDirtyWorktree,
  listDirtyWorktreePaths,
  hasWatchedScriptChanges,
  isRecoverableGitCommandError,
  isAncestor,
  isProcessAlive,
  listChangedFilesBetweenRevisions,
  loadRuntimeSnapshot,
  main,
  mirrorExistingWatchSession,
  parseArgs,
  parseProxyLogEntries,
  parseUpstreamRef,
  prependPendingDeployment,
  pullTrackedBranch,
  readDeploymentHistory,
  readInstantRolloutRequest,
  readPendingDeployRequest,
  readWatchArgsFile,
  readWatchLock,
  readWatchStatus,
  releaseWatchLock,
  resolveCurrentBlueGreenStatus,
  resolveLockedBranchTarget,
  runBunUpgradeAndInstall,
  runBlueGreenDeploy,
  runPendingDeployAfterRestart,
  runDeployWatchIteration,
  runDeployWatchLoop,
  runWatcherCommand,
  sleep,
  spawnReplacementWatcher,
  startBlueGreenWatcherContainer,
  stripAnsi,
  summarizeRequestRate,
  streamBlueGreenWatcherLogs,
  terminateExistingWatcher,
  createPendingDeploymentEntry,
  createQuietRunCommand,
  hasPersistedPendingDeployRequest,
  summarizeBlueGreenRuntime,
  summarizeResult,
  waitForProcessExit,
  writeWatchArgsFile,
  writePendingDeployRequest,
  writeWatchStatus,
  writeDeploymentHistory,
};
