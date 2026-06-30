const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_ROOT_DIR = '/workspace-host';
const DEFAULT_PORT = 7810;
const DEFAULT_WATCHDOG_INTERVAL_MS = 30_000;
const DEFAULT_RUNNER_STALE_AFTER_MS = 120_000;
const DEFAULT_RECOVERY_COOLDOWN_MS = 60_000;
const WATCHER_SERVICE = 'web-blue-green-watcher';
const CRON_RUNNER_SERVICE = 'web-cron-runner';

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/iu.test(String(value ?? '').trim());
}

function trimMessage(value, limit = 1000) {
  return (value instanceof Error ? value.message : String(value)).slice(
    0,
    limit
  );
}

function createDockerControlConfig(env = process.env) {
  const rootDir = env.PLATFORM_HOST_WORKSPACE_DIR || DEFAULT_ROOT_DIR;
  const runtimeRoot =
    env.PLATFORM_BLUE_GREEN_MONITORING_DIR ||
    path.join(rootDir, 'tmp', 'docker-web');
  const cronMonitoringDir =
    env.PLATFORM_CRON_MONITORING_DIR || path.join(runtimeRoot, 'cron');

  return {
    cronRunnerService: CRON_RUNNER_SERVICE,
    cronStatusFile: path.join(cronMonitoringDir, 'status.json'),
    port: parsePositiveInteger(env.PLATFORM_DOCKER_CONTROL_PORT, DEFAULT_PORT),
    prodComposeFile:
      env.PLATFORM_DOCKER_CONTROL_COMPOSE_FILE ||
      path.join(rootDir, 'docker-compose.web.prod.yml'),
    rootDir,
    statusFile:
      env.PLATFORM_DOCKER_CONTROL_STATUS_FILE ||
      path.join(rootDir, 'tmp', 'docker-web', 'docker-control', 'status.json'),
    token: env.PLATFORM_DOCKER_CONTROL_TOKEN || '',
    watcherService: WATCHER_SERVICE,
    watchdog: {
      cooldownMs: parsePositiveInteger(
        env.PLATFORM_DOCKER_CONTROL_CRON_RECOVERY_COOLDOWN_MS,
        DEFAULT_RECOVERY_COOLDOWN_MS
      ),
      enabled: !isTruthy(env.PLATFORM_DOCKER_CONTROL_CRON_WATCHDOG_DISABLED),
      intervalMs: parsePositiveInteger(
        env.PLATFORM_DOCKER_CONTROL_CRON_WATCHDOG_INTERVAL_MS,
        DEFAULT_WATCHDOG_INTERVAL_MS
      ),
      staleAfterMs: parsePositiveInteger(
        env.PLATFORM_DOCKER_CONTROL_CRON_RUNNER_STALE_AFTER_MS,
        DEFAULT_RUNNER_STALE_AFTER_MS
      ),
    },
  };
}

function writeJsonFile(filePath, value, fsImpl = fs) {
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonFile(filePath, fsImpl = fs) {
  try {
    if (!fsImpl.existsSync(filePath)) {
      return { ok: false, value: null, error: 'missing' };
    }

    return {
      ok: true,
      value: JSON.parse(fsImpl.readFileSync(filePath, 'utf8')),
      error: null,
    };
  } catch (error) {
    return { ok: false, value: null, error: trimMessage(error, 500) };
  }
}

function normalizeHeartbeatHealth(updatedAt, now, staleAfterMs) {
  if (updatedAt == null) {
    return { ageMs: null, status: 'missing', updatedAt: null };
  }

  const ageMs = Math.max(0, now - updatedAt);
  return {
    ageMs,
    status: ageMs > staleAfterMs ? 'stale' : 'healthy',
    updatedAt,
  };
}

function readCronRunnerHeartbeat({
  config = createDockerControlConfig(),
  fsImpl = fs,
  now = Date.now(),
} = {}) {
  const parsed = readJsonFile(config.cronStatusFile, fsImpl);
  if (!parsed.ok) {
    return {
      ageMs: null,
      detail:
        parsed.error === 'missing'
          ? 'Cron runner heartbeat file is missing.'
          : `Cron runner heartbeat file is invalid: ${parsed.error}`,
      status: parsed.error === 'missing' ? 'missing' : 'invalid',
      updatedAt: null,
    };
  }

  const updatedAt =
    typeof parsed.value?.updatedAt === 'number' ? parsed.value.updatedAt : null;
  const health = normalizeHeartbeatHealth(
    updatedAt,
    now,
    config.watchdog.staleAfterMs
  );

  return {
    ...health,
    detail:
      health.status === 'stale'
        ? `Cron runner heartbeat is stale by ${health.ageMs}ms.`
        : health.status === 'missing'
          ? 'Cron runner heartbeat updatedAt is missing.'
          : null,
  };
}

function runCommand(
  command,
  args,
  {
    config = createDockerControlConfig(),
    env = process.env,
    spawnImpl = spawn,
    timeoutMs = 10 * 60 * 1000,
  } = {}
) {
  return new Promise((resolve) => {
    const child = spawnImpl(command, args, {
      cwd: config.rootDir,
      env: {
        ...env,
        PLATFORM_HOST_WORKSPACE_DIR: config.rootDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      stdout = stdout.slice(-4000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      stderr = stderr.slice(-4000);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stderr, stdout });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, signal: null, stderr: error.message, stdout });
    });
  });
}

function composeUpArgs(config, serviceName, recreateMode) {
  return [
    'compose',
    '-f',
    config.prodComposeFile,
    '--profile',
    'redis',
    'up',
    '--build',
    '--detach',
    recreateMode,
    '--remove-orphans',
    serviceName,
  ];
}

function composePsArgs(config, serviceName) {
  return [
    'compose',
    '-f',
    config.prodComposeFile,
    '--profile',
    'redis',
    'ps',
    '--format',
    'json',
    serviceName,
  ];
}

function sanitizeCommandResult(result, serviceName) {
  return {
    code: result.code,
    detail: `${serviceName} compose command failed with exit code ${result.code ?? 'unknown'}.`,
    signal: result.signal,
  };
}

async function ensureService({
  config = createDockerControlConfig(),
  recreateMode,
  run = runCommand,
  serviceName,
}) {
  const result = await run(
    'docker',
    composeUpArgs(config, serviceName, recreateMode),
    { config }
  );
  if (result.code !== 0) {
    throw new Error(sanitizeCommandResult(result, serviceName).detail);
  }
}

async function inspectService({
  config = createDockerControlConfig(),
  run = runCommand,
  serviceName,
}) {
  const result = await run('docker', composePsArgs(config, serviceName), {
    config,
    timeoutMs: 30_000,
  });

  if (result.code !== 0) {
    return {
      detail: sanitizeCommandResult(result, serviceName).detail,
      serviceName,
      status: 'unknown',
    };
  }

  const lines = result.stdout.split(/\r?\n/u).filter(Boolean);
  const parsed = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .find(Boolean);

  return {
    serviceName,
    status: String(parsed?.Health || parsed?.State || 'missing').toLowerCase(),
  };
}

function getUnhealthyContainerReason(service) {
  if (!service || service.status === 'missing') {
    return 'Cron runner container is missing.';
  }

  if (
    service.status === 'healthy' ||
    service.status === 'running' ||
    service.status === 'up'
  ) {
    return null;
  }

  if (service.status === 'unknown') {
    return service.detail || 'Cron runner container health is unknown.';
  }

  return `Cron runner container is ${service.status}.`;
}

function getCronRunnerRecoveryReason({ heartbeat, service }) {
  const containerReason = getUnhealthyContainerReason(service);
  if (containerReason) {
    return containerReason;
  }

  if (
    heartbeat.status === 'missing' ||
    heartbeat.status === 'invalid' ||
    heartbeat.status === 'stale'
  ) {
    return heartbeat.detail || `Cron runner heartbeat is ${heartbeat.status}.`;
  }

  return null;
}

function createRecovery({
  action,
  reason,
  source,
  startedAt,
  status,
  extra = {},
}) {
  return {
    action,
    reason: reason || null,
    requestedAt: new Date(startedAt).toISOString(),
    source,
    status,
    ...extra,
  };
}

async function recoverCronRunner({
  action = 'restart',
  config = createDockerControlConfig(),
  onRecovery = () => {},
  reason = null,
  run = runCommand,
  source = 'operator',
} = {}) {
  const startedAt = Date.now();
  const runningRecovery = createRecovery({
    action,
    reason,
    source,
    startedAt,
    status: 'running',
  });
  onRecovery(runningRecovery);

  try {
    await ensureService({
      config,
      recreateMode: '--no-recreate',
      run,
      serviceName: config.watcherService,
    });
    await ensureService({
      config,
      recreateMode: action === 'restart' ? '--force-recreate' : '--no-recreate',
      run,
      serviceName: config.cronRunnerService,
    });

    const [watcher, cronRunner] = await Promise.all([
      inspectService({
        config,
        run,
        serviceName: config.watcherService,
      }),
      inspectService({
        config,
        run,
        serviceName: config.cronRunnerService,
      }),
    ]);

    const recovery = createRecovery({
      action,
      extra: {
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAt),
        services: {
          cronRunner,
          watcher,
        },
      },
      reason,
      source,
      startedAt,
      status: 'succeeded',
    });
    onRecovery(recovery);
    return recovery;
  } catch (error) {
    const recovery = createRecovery({
      action,
      extra: {
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAt),
        error: trimMessage(error),
      },
      reason,
      source,
      startedAt,
      status: 'failed',
    });
    onRecovery(recovery);
    return recovery;
  }
}

function createWatchdogStatus({
  config,
  cooldownRemainingMs = null,
  error = null,
  lastCheckedAt = null,
  reason = null,
  status,
}) {
  return {
    cooldownRemainingMs,
    enabled: config.watchdog.enabled,
    lastCheckedAt,
    lastError: error,
    lastReason: reason,
    status,
  };
}

async function runCronRunnerWatchdogCycle({
  config = createDockerControlConfig(),
  fsImpl = fs,
  now = Date.now(),
  onRecovery = () => {},
  onStatus = () => {},
  run = runCommand,
  state = {},
} = {}) {
  if (!config.watchdog.enabled) {
    const status = createWatchdogStatus({
      config,
      lastCheckedAt: now,
      status: 'disabled',
    });
    onStatus(status, null);
    return status;
  }

  if (state.running) {
    const status = createWatchdogStatus({
      config,
      lastCheckedAt: now,
      reason: state.lastReason || 'Cron runner recovery is already running.',
      status: 'recovering',
    });
    onStatus(status, null);
    return status;
  }

  const heartbeat = readCronRunnerHeartbeat({ config, fsImpl, now });
  const service = await inspectService({
    config,
    run,
    serviceName: config.cronRunnerService,
  });
  const reason = getCronRunnerRecoveryReason({ heartbeat, service });
  state.lastCheckedAt = now;
  state.lastReason = reason;

  if (!reason) {
    const status = createWatchdogStatus({
      config,
      lastCheckedAt: now,
      status: 'healthy',
    });
    onStatus(status, null);
    return status;
  }

  const lastAttemptAt =
    typeof state.lastAttemptAt === 'number' ? state.lastAttemptAt : null;
  const cooldownRemainingMs =
    lastAttemptAt == null
      ? 0
      : Math.max(0, config.watchdog.cooldownMs - (now - lastAttemptAt));

  if (cooldownRemainingMs > 0) {
    const status = createWatchdogStatus({
      config,
      cooldownRemainingMs,
      lastCheckedAt: now,
      reason,
      status: 'cooldown',
    });
    onStatus(status, null);
    return status;
  }

  state.lastAttemptAt = now;
  state.running = true;
  onStatus(
    createWatchdogStatus({
      config,
      lastCheckedAt: now,
      reason,
      status: 'recovering',
    }),
    null
  );

  const recovery = await recoverCronRunner({
    action: 'restart',
    config,
    onRecovery,
    reason,
    run,
    source: 'watchdog',
  });
  state.running = false;

  const status = createWatchdogStatus({
    config,
    error: recovery.status === 'failed' ? recovery.error || null : null,
    lastCheckedAt: Date.now(),
    reason,
    status: recovery.status === 'failed' ? 'failed' : 'recovered',
  });
  onStatus(status, recovery);
  return status;
}

function startCronRunnerWatchdog({
  config = createDockerControlConfig(),
  fsImpl = fs,
  onRecovery = () => {},
  onStatus = () => {},
  run = runCommand,
  state = {},
} = {}) {
  if (!config.watchdog.enabled) {
    const status = createWatchdogStatus({
      config,
      lastCheckedAt: Date.now(),
      status: 'disabled',
    });
    onStatus(status, null);
    return { stop() {} };
  }

  const tick = () => {
    void runCronRunnerWatchdogCycle({
      config,
      fsImpl,
      onRecovery,
      onStatus,
      run,
      state,
    }).catch((error) => {
      state.running = false;
      onStatus(
        createWatchdogStatus({
          config,
          error: trimMessage(error),
          lastCheckedAt: Date.now(),
          reason: state.lastReason || null,
          status: 'failed',
        }),
        null
      );
    });
  };
  const timer = setInterval(tick, config.watchdog.intervalMs);
  timer.unref?.();
  tick();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}

module.exports = {
  CRON_RUNNER_SERVICE,
  DEFAULT_RECOVERY_COOLDOWN_MS,
  DEFAULT_RUNNER_STALE_AFTER_MS,
  DEFAULT_WATCHDOG_INTERVAL_MS,
  WATCHER_SERVICE,
  composePsArgs,
  composeUpArgs,
  createDockerControlConfig,
  getCronRunnerRecoveryReason,
  inspectService,
  readCronRunnerHeartbeat,
  recoverCronRunner,
  runCommand,
  runCronRunnerWatchdogCycle,
  sanitizeCommandResult,
  startCronRunnerWatchdog,
  writeJsonFile,
};
