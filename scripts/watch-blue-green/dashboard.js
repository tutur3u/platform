const readline = require('node:readline');

const {
  DEFAULT_INTERVAL_MS,
  DISPLAY_DEPLOYMENTS,
  MAX_EVENTS,
} = require('./watcher-constants.js');

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

const TERMINAL_ESCAPE_SEQUENCE_PATTERN = new RegExp(
  [
    '\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\\\)',
    '\\u001B[P_^][\\s\\S]*?\\u001B\\\\',
    '\\u001B\\[[0-?]*[ -/]*[@-~]',
    '\\u001B[ -/]*[@-~]',
  ].join('|'),
  'g'
);

// biome-ignore lint/complexity/useRegexLiterals: literal form triggers noControlCharactersInRegex here
const TERMINAL_CONTROL_CHARACTER_PATTERN = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]',
  'g'
);

function stripAnsi(value) {
  return String(value).replace(TERMINAL_ESCAPE_SEQUENCE_PATTERN, '');
}

function sanitizeDashboardText(value, fallback = '') {
  const sanitized = stripAnsi(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(TERMINAL_CONTROL_CHARACTER_PATTERN, '')
    .replace(/ {2,}/g, ' ')
    .trim();

  return sanitized || fallback;
}

function sanitizeDashboardColor(value, fallback = 'dim') {
  const color = sanitizeDashboardText(value, fallback);
  return ANSI[color] ? color : fallback;
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
    case 'deployment-active':
      return colorize('yellow', 'Deployment already active, waiting');
    case 'deployed':
      return colorize('green', 'Deploy succeeded');
    case 'dirty':
      return colorize('yellow', 'Dirty worktree, waiting');
    case 'diverged':
      return colorize('yellow', 'Branch diverged, waiting');
    case 'git-failed':
      return colorize('yellow', 'Git failed, retrying');
    case 'retry-limited':
      return colorize('yellow', 'Deployment retry limit reached');
    case 'pin-deploy-failed':
      return colorize('red', 'Pinned rollback failed');
    case 'pinned':
      return colorize('yellow', 'Pinned to rollback');
    case 'pinned-deployed':
      return colorize('green', 'Pinned rollback deployed');
    case 'recovered':
      return colorize('green', 'Recovered active and standby');
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
    .map((line) => sanitizeDashboardText(line))
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
    return colorize(
      'yellow',
      sanitizeDashboardText(currentBlueGreen.message, 'unknown')
    );
  }

  const activeColor = sanitizeDashboardText(
    currentBlueGreen.activeColor,
    'unknown'
  );
  const base =
    currentBlueGreen.state === 'degraded'
      ? colorize(
          'yellow',
          `degraded${currentBlueGreen.activeColor ? ` (${activeColor})` : ''}`
        )
      : colorize('green', `serving ${activeColor}`);
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
    return colorize(
      'yellow',
      sanitizeDashboardText(resources.message, 'unavailable')
    );
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
    return colorize(
      'yellow',
      sanitizeDashboardText(resources.message, 'unavailable')
    );
  }

  if (!resources?.containers?.length) {
    return colorize('dim', 'none');
  }

  return resources.containers
    .slice(0, maxContainers)
    .map((container) => {
      const label = sanitizeDashboardText(container.label, 'container');
      const color = sanitizeDashboardColor(container.color, 'dim');

      return [
        formatBadge(label.toUpperCase(), color),
        formatMetric('cpu', formatCpuPercent(container.cpuPercent), 'yellow'),
        formatMetric('mem', formatBytes(container.memoryBytes), 'magenta'),
        formatMetric(
          'net',
          `${formatBytes(container.rxBytes)} / ${formatBytes(container.txBytes)}`,
          'cyan'
        ),
      ].join(' ');
    })
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
    const activeColor = sanitizeDashboardText(entry.activeColor);
    const commitShortHash = sanitizeDashboardText(
      entry.commitShortHash,
      'unknown'
    );
    const heading = formatHeaderLine(
      `${colorize('dim', `[${formatClockTime(timestamp)}]`)} ${emphasize(
        'cyan',
        commitShortHash
      )}`,
      [
        formatBadge(statusMeta.label, statusMeta.color),
        activeColor ? formatBadge(activeColor, 'cyan') : null,
      ]
        .filter(Boolean)
        .join(' '),
      innerWidth
    );
    const commitLine = sanitizeDashboardText(
      entry.commitSubject,
      'Unknown deployment'
    );
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
    ? `${colorize(
        'green',
        sanitizeDashboardText(state.latestCommit.shortHash, 'unknown')
      )} ${truncateText(
        sanitizeDashboardText(state.latestCommit.subject, 'Unknown commit'),
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

          return `${colorize('dim', `[${formatClockTime(event.time)}]`)} ${colorize(levelColor, event.level.toUpperCase().padEnd(5, ' '))} ${truncateText(sanitizeDashboardText(event.message), Math.max(24, contentWidth - 20))}`;
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
      `${colorize(
        'cyan',
        sanitizeDashboardText(state.target?.branch, 'unknown')
      )} -> ${colorize(
        'cyan',
        sanitizeDashboardText(state.target?.upstreamRef, 'unknown')
      )}`
    ),
    ...(state.deploymentPin
      ? [
          formatRow(
            'Pinned',
            `${colorize(
              'yellow',
              sanitizeDashboardText(
                state.deploymentPin.commitShortHash ??
                  state.deploymentPin.commitHash.slice(0, 12),
                'unknown'
              )
            )} ${truncateText(
              sanitizeDashboardText(
                state.deploymentPin.commitSubject,
                'Selected deployment'
              ),
              Math.max(24, contentWidth - 34)
            )}`
          ),
        ]
      : []),
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
    formatRow(
      'Lock file',
      state.lockFile
        ? sanitizeDashboardText(state.lockFile)
        : colorize('dim', 'not acquired')
    ),
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
  summarizeDockerContainers,
  summarizeDockerResources,
  summarizeResult,
};
