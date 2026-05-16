const fs = require('node:fs');
const path = require('node:path');

const {
  readBlueGreenActiveColor,
  readBlueGreenProxyActiveColor,
} = require('../docker-web/blue-green.js');
const { getComposeEnvironment, WEB_ENV_FILE } = require('../docker-web/env.js');
const {
  getComposeCommandArgs,
  getComposeFile,
  getContainerHealthStatus,
  runChecked,
  runCommand,
} = require('../docker-web/compose.js');
const { ROOT_DIR, getWatchPaths } = require('./paths.js');
const { readDeploymentHistory } = require('./history.js');
const {
  enrichDeploymentsWithTelemetry,
  readTelemetrySummary,
  syncProxyTrafficStore,
} = require('./telemetry.js');

const BLUE_GREEN_COLORS = ['blue', 'green'];
const PROD_COMPOSE_FILE = getComposeFile('prod');
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const HOST_WORKSPACE_DIR_ENV = 'PLATFORM_HOST_WORKSPACE_DIR';

function isTruthyEnv(value) {
  return /^(1|true|yes)$/iu.test(String(value ?? '').trim());
}

function getWatcherComposeEnv({
  baseEnv = process.env,
  envFilePath,
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const hostWorkspaceDir =
    typeof baseEnv[HOST_WORKSPACE_DIR_ENV] === 'string' &&
    baseEnv[HOST_WORKSPACE_DIR_ENV].trim().length > 0
      ? baseEnv[HOST_WORKSPACE_DIR_ENV].trim()
      : rootDir;

  return {
    ...getComposeEnvironment({
      baseEnv,
      envFilePath,
      fsImpl,
      rootDir: hostWorkspaceDir,
      withCloudflared: isTruthyEnv(baseEnv.DOCKER_WEB_WITH_CLOUDFLARED),
      withRedis: true,
    }),
    [HOST_WORKSPACE_DIR_ENV]: hostWorkspaceDir,
  };
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

async function isContainerHealthyForStatus(
  containerId,
  { env, runCommand: run = runCommand }
) {
  if (!containerId) {
    return false;
  }

  try {
    return (
      (await getContainerHealthStatus(containerId, {
        env,
        runCommand: run,
      })) === 'healthy'
    );
  } catch {
    return true;
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
    const activeServiceRunning = await isContainerHealthyForStatus(
      activeContainerId,
      {
        env,
        runCommand: run,
      }
    );
    const standbyColor =
      (
        await Promise.all(
          liveColors
            .filter((color) => color !== activeColor)
            .map(async (color) => ({
              color,
              healthy: await isContainerHealthyForStatus(serviceStates[color], {
                env,
                runCommand: run,
              }),
            }))
        )
      ).find(({ healthy }) => healthy)?.color ?? null;
    const proxyRunning = await isContainerHealthyForStatus(proxyContainerId, {
      env,
      runCommand: run,
    });

    return {
      activeColor,
      activeServiceRunning,
      liveColors,
      proxyRunning,
      serviceContainers: {
        proxy: proxyContainerId,
        'web-blue': serviceStates.blue,
        'web-green': serviceStates.green,
      },
      standbyColor,
      state:
        activeColor && proxyRunning && activeServiceRunning
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

  if (normalized.includes('(unhealthy)')) {
    return 'unhealthy';
  }

  if (normalized.includes('(healthy)')) {
    return 'healthy';
  }

  if (normalized.includes('(health: starting)')) {
    return 'starting';
  }

  return normalized.startsWith('up') ? 'healthy' : 'unknown';
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
  const health = parseDockerHealthFromStatus(status);
  const trimmedImage = image.trim() || null;
  const trimmedName = name.trim();

  return {
    containerId: containerId.trim(),
    health,
    image: trimmedImage,
    name: trimmedName,
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
    const appContainers = containerId
      ? (
          await Promise.all(
            ['blue', 'green'].map(async (deploymentColor) => ({
              containerId: await getProdComposeServiceContainerId(
                `web-${deploymentColor}`,
                {
                  env,
                  envFilePath,
                  fsImpl,
                  rootDir,
                  runCommand: run,
                }
              ),
              deploymentColor,
            }))
          )
        ).filter((container) => container.containerId)
      : [];

    if (successfulDeployments.length > 0 || containerId) {
      await syncProxyTrafficStore(deployments, {
        appContainers,
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

module.exports = {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_PROXY_SERVICE,
  HOST_WORKSPACE_DIR_ENV,
  PROD_COMPOSE_FILE,
  collectDeploymentTraffic,
  getProdComposeServiceContainerId,
  getWatcherComposeEnv,
  loadRuntimeSnapshot,
  resolveCurrentBlueGreenStatus,
};
