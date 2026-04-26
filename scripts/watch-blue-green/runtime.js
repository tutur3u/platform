const fs = require('node:fs');

const {
  readBlueGreenActiveColor,
  readBlueGreenProxyActiveColor,
} = require('../docker-web/blue-green.js');
const { getComposeEnvironment, WEB_ENV_FILE } = require('../docker-web/env.js');
const {
  getComposeCommandArgs,
  getComposeFile,
  runChecked,
  runCommand,
} = require('../docker-web/compose.js');
const { getWatchPaths, ROOT_DIR } = require('./paths.js');

const BLUE_GREEN_COLORS = ['blue', 'green'];
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const MAX_DEPLOYMENTS = 3;
const PROD_COMPOSE_FILE = getComposeFile('prod');

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
  const nextHistory = history.map((existing) => {
    if (
      entry.status === 'successful' &&
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
      latestDeployment.status === 'failed'
        ? 'failed'
        : latestDeployment.status === 'building' ||
            latestDeployment.status === 'deploying'
          ? latestDeployment.status
          : 'successful',
  };
}

function createPendingDeploymentEntry({
  activeColor = null,
  latestCommit = null,
  startedAt,
  status = 'deploying',
} = {}) {
  return {
    activeColor,
    buildDurationMs: null,
    commitHash: latestCommit?.hash ?? null,
    commitShortHash: latestCommit?.shortHash ?? null,
    commitSubject: latestCommit?.subject ?? null,
    startedAt,
    status,
  };
}

function prependPendingDeployment(deployments, pendingDeployment) {
  return [
    pendingDeployment,
    ...(deployments ?? []).filter(
      (entry) =>
        !(
          pendingDeployment.commitHash &&
          entry.commitHash === pendingDeployment.commitHash &&
          (entry.status === 'building' || entry.status === 'deploying')
        )
    ),
  ].slice(0, MAX_DEPLOYMENTS);
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
  const activeColor =
    readBlueGreenActiveColor(paths.blueGreen, fsImpl) ??
    readBlueGreenProxyActiveColor(paths.blueGreen, fsImpl);
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
        liveColors: [],
        proxyRunning: false,
        standbyColor: null,
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
      standbyColor: null,
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
      dailyAverageRequests: 0,
      dailyPeakRequests: 0,
      dailyRequestCount: 0,
      peakRequestsPerMinute: 0,
      requestCount: 0,
    };
  }

  const minuteBucketCounts = new Map();
  const dayBucketCounts = new Map();
  let requestCount = 0;

  for (const entry of entries) {
    if (entry.path === '/api/health') {
      continue;
    }

    if (entry.time < startTime || entry.time >= endTime) {
      continue;
    }

    requestCount += 1;
    const minuteBucket = Math.floor(entry.time / 60_000);
    const dayBucket = Math.floor(entry.time / 86_400_000);
    minuteBucketCounts.set(
      minuteBucket,
      (minuteBucketCounts.get(minuteBucket) ?? 0) + 1
    );
    dayBucketCounts.set(dayBucket, (dayBucketCounts.get(dayBucket) ?? 0) + 1);
  }

  const durationMinutes = Math.max((endTime - startTime) / 60_000, 1 / 60);
  const durationDays = Math.max((endTime - startTime) / 86_400_000, 1 / 86_400);
  const finalDayBucket = Math.floor(
    Math.max(startTime, endTime - 1) / 86_400_000
  );

  return {
    averageRequestsPerMinute: requestCount / durationMinutes,
    dailyAverageRequests: requestCount / durationDays,
    dailyPeakRequests: Math.max(0, ...dayBucketCounts.values()),
    dailyRequestCount: dayBucketCounts.get(finalDayBucket) ?? 0,
    peakRequestsPerMinute: Math.max(0, ...minuteBucketCounts.values()),
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
      dailyAverageRequests: null,
      dailyPeakRequests: null,
      dailyRequestCount: null,
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
        dailyAverageRequests: null,
        dailyPeakRequests: null,
        dailyRequestCount: null,
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
          averageRequestsPerMinute: null,
          dailyAverageRequests: null,
          dailyPeakRequests: null,
          dailyRequestCount: null,
          lifetimeMs,
          peakRequestsPerMinute: null,
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
        dailyAverageRequests: rateSummary.dailyAverageRequests,
        dailyPeakRequests: rateSummary.dailyPeakRequests,
        dailyRequestCount: rateSummary.dailyRequestCount,
        lifetimeMs,
        peakRequestsPerMinute: rateSummary.peakRequestsPerMinute,
        requestCount: rateSummary.requestCount,
      };
    });
  } catch {
    return deployments.map((entry) => ({
      ...entry,
      averageRequestsPerMinute: null,
      dailyAverageRequests: null,
      dailyPeakRequests: null,
      dailyRequestCount: null,
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
  const liveColors = new Set(currentBlueGreen.liveColors ?? []);
  const runtimeAwareDeployments = deployments.map((entry) => {
    const isLive =
      entry.status === 'successful' &&
      typeof entry.activeColor === 'string' &&
      liveColors.has(entry.activeColor);

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
    deployments: runtimeAwareDeployments,
  };
}

module.exports = {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_PROXY_SERVICE,
  MAX_DEPLOYMENTS,
  PROD_COMPOSE_FILE,
  appendDeploymentHistory,
  collectDeploymentTraffic,
  createPendingDeploymentEntry,
  getLatestDeploymentSummary,
  getProdComposeServiceContainerId,
  getWatcherComposeEnv,
  loadRuntimeSnapshot,
  parseProxyLogEntries,
  prependPendingDeployment,
  readDeploymentHistory,
  resolveCurrentBlueGreenStatus,
  summarizeRequestRate,
  writeDeploymentHistory,
};
