const readline = require('node:readline');

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
    const status = entry.runtimeState
      ? colorize('green', 'ACTIVE')
      : entry.status === 'failed'
        ? colorize('red', 'FAILED')
        : entry.status === 'building'
          ? colorize('magenta', 'BUILDING')
          : entry.status === 'deploying'
            ? colorize('cyan', 'DEPLOYING')
            : entry.endedAt
              ? colorize('cyan', 'ENDED')
              : colorize('green', 'ACTIVE');
    const timestamp = entry.finishedAt ?? entry.startedAt;
    const heading = `[${formatClockTime(timestamp)}] ${status} ${entry.activeColor ?? '-'}`;
    const commitLine =
      `${entry.commitShortHash ?? 'unknown'} ${entry.commitSubject ?? ''}`.trim();
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
    const liveBuildDurationMs =
      getDeploymentElapsedMs(entry, { now }) ?? entry.buildDurationMs;
    const metricsOne = [
      formatMetric('build', formatDuration(liveBuildDurationMs), 'cyan'),
      formatMetric('life', formatDuration(entry.lifetimeMs), 'magenta'),
      formatMetric('age', formatRelativeTime(timestamp, { now }), 'dim'),
    ].join('  ');
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
    ].join('  ');
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
    ].join('  ');

    return [
      topBorder,
      `│ ${padCell(heading, innerWidth)} │`,
      `│ ${padCell(commitLine, innerWidth)} │`,
      middleBorder,
      `│ ${padCell(metricsOne, innerWidth)} │`,
      `│ ${padCell(metricsTwo, innerWidth)} │`,
      `│ ${padCell(metricsThree, innerWidth)} │`,
      `│ ${padCell(lifecycle, innerWidth)} │`,
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
  const activePendingDeployment = state.deployments?.[0];
  const lastDeployDetails = [formatRelativeTime(state.lastDeployAt, { now })];

  if (
    activePendingDeployment &&
    (state.lastDeployStatus === 'deploying' ||
      state.lastDeployStatus === 'building')
  ) {
    const elapsedMs = getDeploymentElapsedMs(activePendingDeployment, { now });

    if (elapsedMs != null) {
      lastDeployDetails.push(`${formatDuration(elapsedMs)} build`);
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

function createWatchUi(initialState = {}, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const now = options.now ?? (() => Date.now());
  const isTTY = options.isTTY ?? Boolean(stdout.isTTY);
  const maxEvents = options.maxEvents ?? 8;
  const state = {
    deployments: [],
    events: [],
    intervalMs: options.defaultIntervalMs ?? 1_000,
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

module.exports = {
  buildDashboardView,
  colorize,
  createWatchUi,
  emphasize,
  formatClockTime,
  formatCountdown,
  formatDailyRequestCount,
  formatDuration,
  formatMetric,
  formatRelativeTime,
  formatRequestCount,
  formatRequestsPerDay,
  formatRequestsPerMinute,
  getDeploymentElapsedMs,
  stripAnsi,
  summarizeBlueGreenRuntime,
  summarizeResult,
};
