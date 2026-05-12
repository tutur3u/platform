const fs = require('node:fs');
const path = require('node:path');

const {
  getComposeCommandArgs,
  getComposeFile,
  getComposeServiceContainerId,
  getComposeServiceContainerName,
  hasComposeProfile,
  hasComposeServiceContainer,
  isComposeServiceHealthy,
  removeComposeServicesIfPresent,
  runComposeUpWithNameConflictRecovery,
  runChecked,
  runCommand,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
} = require('./compose.js');
const {
  DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME,
  DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV,
  getComposeEnvironment,
  getDockerWebComposeProjectName,
  LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
} = require('./env.js');
const {
  BUILD_STALL_RECOVERY_REASON,
  CACHED_BUILD_ERROR_RECOVERY_REASON,
  isBuildStallTimeoutError,
  isBunTarballExtractionError,
  isCachedBuildError,
  recoverBuildkitBunInstallCache,
} = require('./buildkit-builder.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DOCKER_WEB_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web');
const BLUE_GREEN_RUNTIME_DIR = path.join(DOCKER_WEB_RUNTIME_DIR, 'prod');
const BLUE_GREEN_PROXY_CONFIG_FILE = path.join(
  BLUE_GREEN_RUNTIME_DIR,
  'nginx.conf'
);
const BLUE_GREEN_STATE_FILE = path.join(BLUE_GREEN_RUNTIME_DIR, 'active-color');
const BLUE_GREEN_STAMP_FILE = path.join(
  BLUE_GREEN_RUNTIME_DIR,
  'deployment-stamp'
);
const BLUE_GREEN_DRAIN_STATUS_PATH = '/__platform/drain-status';
const BLUE_GREEN_DRAIN_POLL_MS = 1_000;
const BLUE_GREEN_DRAIN_TIMEOUT_MS = 5 * 60_000;
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const CLOUDFLARED_SERVICE = 'cloudflared';
/** Started in a second compose phase so web/proxy/redis can become healthy first. */
const BLUE_GREEN_DEFERRED_SUPPORT_SERVICES = Object.freeze([
  'hive-blue',
  'hive-green',
  'hive-realtime',
]);
/** Support sidecars that gate blue/green promotion (Hive warms independently). */
const BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE = Object.freeze([
  'markitdown',
  'storage-unzip-proxy',
  'web-cron-runner',
]);
const BLUE_GREEN_SUPPORT_SERVICES = Object.freeze([
  ...BLUE_GREEN_DEFERRED_SUPPORT_SERVICES,
  ...BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
]);
const BLUE_GREEN_COLORS = ['blue', 'green'];
const LEGACY_HIVE_SERVICE = 'hive';
const BLUE_GREEN_PROXY_DRAIN_MS = 20_000;
const BLUE_GREEN_PROXY_RESPONSE_BUFFER_SIZE = '128k';
const BLUE_GREEN_PROXY_RESPONSE_BUFFERS = '8 128k';
const BLUE_GREEN_PROXY_BUSY_BUFFER_SIZE = '256k';
const BLUE_GREEN_MIGRATION_PROXY_HANDOFF_TIMEOUT_MS = 3_000;
const DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS = 45 * 60_000;
const BLUE_GREEN_MIGRATION_STAGING_PORT_ENV = {
  DOCKER_WEB_BUILDKIT_PORT: '17914',
  DOCKER_WEB_DIRECT_HOST_PORT: '17804',
  DOCKER_HIVE_PROXY_HOST_PORT: '17814',
  DOCKER_WEB_PROXY_HOST_PORT: '17803',
  DOCKER_WEB_REDIS_HOST_PORT: '16379',
  DOCKER_WEB_SERVERLESS_REDIS_HTTP_HOST_PORT: '18079',
};
const BLUE_GREEN_PROXY_REQUIRED_HOST_PORTS = Object.freeze([
  {
    containerPort: '7803',
    defaultHostPort: '7803',
    envKey: 'DOCKER_WEB_PROXY_HOST_PORT',
  },
  {
    containerPort: '7814',
    defaultHostPort: '7814',
    envKey: 'DOCKER_HIVE_PROXY_HOST_PORT',
  },
]);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function splitBlueGreenProdServicePhases(serviceNames) {
  const deferred = new Set(BLUE_GREEN_DEFERRED_SUPPORT_SERVICES);
  const phase1Services = [];
  const phase2Services = [];
  for (const name of serviceNames) {
    if (deferred.has(name)) {
      phase2Services.push(name);
    } else {
      phase1Services.push(name);
    }
  }
  return { phase1Services, phase2Services };
}

function getProjectNameFromEnv(env, key) {
  return typeof env?.[key] === 'string' ? env[key].trim() : '';
}

function getBlueGreenMigrationSourceEnv(env, sourceProjectName) {
  return {
    ...env,
    COMPOSE_PROJECT_NAME: sourceProjectName,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: sourceProjectName,
    DOCKER_HIVE_PROXY_HOST_PORT: '7814',
    DOCKER_WEB_PROXY_HOST_PORT: '7803',
  };
}

function getBlueGreenMigrationTargetEnv(env, targetProjectName) {
  return {
    ...env,
    ...Object.fromEntries(
      Object.entries(BLUE_GREEN_MIGRATION_STAGING_PORT_ENV).map(
        ([key, value]) => [key, env[key] ?? value]
      )
    ),
    [DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV]:
      LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
    COMPOSE_PROJECT_NAME: targetProjectName,
    DOCKER_WEB_COMPOSE_PROJECT_NAME: targetProjectName,
  };
}

async function getBlueGreenComposeMigration({
  composeFile,
  composeGlobalArgs = [],
  env,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const targetProjectName = getDockerWebComposeProjectName({
    baseEnv: env,
    rootDir,
  });
  const migrationSourceProjectName = getProjectNameFromEnv(
    env,
    DOCKER_WEB_MIGRATE_FROM_COMPOSE_PROJECT_ENV
  );
  const shouldDetectLegacyProject =
    !migrationSourceProjectName &&
    targetProjectName === DEFAULT_DOCKER_WEB_COMPOSE_PROJECT_NAME &&
    path.basename(rootDir) === LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME;
  const sourceProjectName =
    migrationSourceProjectName ||
    (shouldDetectLegacyProject ? LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME : '');

  if (!sourceProjectName || sourceProjectName === targetProjectName) {
    return null;
  }

  const sourceEnv = getBlueGreenMigrationSourceEnv(env, sourceProjectName);
  const sourceContainers = await runChecked(
    'docker',
    getComposeCommandArgs(composeFile, composeGlobalArgs, 'ps', '-q'),
    {
      env: sourceEnv,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  if (!sourceContainers.stdout.trim()) {
    return null;
  }

  const targetEnv = migrationSourceProjectName
    ? {
        ...env,
        COMPOSE_PROJECT_NAME: targetProjectName,
        DOCKER_WEB_COMPOSE_PROJECT_NAME: targetProjectName,
      }
    : getBlueGreenMigrationTargetEnv(env, targetProjectName);

  return {
    sourceEnv,
    sourceProjectName,
    targetEnv,
    targetFinalEnv: {
      ...targetEnv,
      DOCKER_HIVE_PROXY_HOST_PORT: '7814',
      DOCKER_WEB_PROXY_HOST_PORT: '7803',
    },
    targetProjectName,
  };
}

function getBlueGreenPaths(rootDir = ROOT_DIR) {
  const runtimeDir = path.join(rootDir, 'tmp', 'docker-web', 'prod');

  return {
    deploymentStampFile: path.join(runtimeDir, 'deployment-stamp'),
    proxyConfigFile: path.join(runtimeDir, 'nginx.conf'),
    runtimeDir,
    stateFile: path.join(runtimeDir, 'active-color'),
  };
}

function ensureBlueGreenRuntime(paths = getBlueGreenPaths(), fsImpl = fs) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
}

function isBlueGreenColor(value) {
  return BLUE_GREEN_COLORS.includes(value);
}

function readBlueGreenActiveColor(paths = getBlueGreenPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.stateFile)) {
    return null;
  }

  const color = fsImpl.readFileSync(paths.stateFile, 'utf8').trim();
  return isBlueGreenColor(color) ? color : null;
}

function readBlueGreenProxyActiveColor(
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (!fsImpl.existsSync(paths.proxyConfigFile)) {
    return null;
  }

  const config = fsImpl.readFileSync(paths.proxyConfigFile, 'utf8');
  const match = config.match(
    /^\s*server\s+web-(blue|green):7803\s+resolve\b(?!.*\bbackup\b).*$/imu
  );
  const color = match?.[1] ?? null;

  return isBlueGreenColor(color) ? color : null;
}

function writeBlueGreenActiveColor(
  color,
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (!isBlueGreenColor(color)) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  ensureBlueGreenRuntime(paths, fsImpl);
  fsImpl.writeFileSync(paths.stateFile, `${color}\n`, 'utf8');
}

function clearBlueGreenRuntime(paths = getBlueGreenPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.runtimeDir)) {
    return;
  }

  fsImpl.rmSync(paths.runtimeDir, { recursive: true, force: true });
}

function readBlueGreenDeploymentStamp(
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (!fsImpl.existsSync(paths.deploymentStampFile)) {
    return null;
  }

  const stamp = fsImpl.readFileSync(paths.deploymentStampFile, 'utf8').trim();
  return stamp || null;
}

function writeBlueGreenDeploymentStamp(
  stamp,
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (typeof stamp !== 'string' || stamp.trim().length === 0) {
    throw new Error('Deployment stamp must be a non-empty string.');
  }

  ensureBlueGreenRuntime(paths, fsImpl);
  fsImpl.writeFileSync(paths.deploymentStampFile, `${stamp.trim()}\n`, 'utf8');
}

function generateBlueGreenDeploymentStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/u, 'Z')
    .replace(/[:.]/gu, '-');
}

function getNextBlueGreenColor(activeColor) {
  return activeColor === 'blue' ? 'green' : 'blue';
}

function getBlueGreenBuildTimeoutMs(env = process.env) {
  const rawValue = env.DOCKER_WEB_BUILD_TIMEOUT_MS;

  if (rawValue == null || rawValue === '') {
    return DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('DOCKER_WEB_BUILD_TIMEOUT_MS must be a positive number.');
  }

  return value;
}

function getBlueGreenServiceName(color) {
  if (!isBlueGreenColor(color)) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  return `web-${color}`;
}

function getBlueGreenHiveServiceName(color) {
  if (!isBlueGreenColor(color)) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  return `hive-${color}`;
}

function getBlueGreenColorScopedSupportServices(color) {
  return [getBlueGreenHiveServiceName(color), 'hive-realtime'];
}

function getBlueGreenPromotionHealthGateServices(color) {
  return [
    getBlueGreenHiveServiceName(color),
    'hive-realtime',
    ...BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
  ];
}

function getComposeProjectName(composeFile, env = {}) {
  if (
    typeof env.COMPOSE_PROJECT_NAME === 'string' &&
    env.COMPOSE_PROJECT_NAME.trim().length > 0
  ) {
    return env.COMPOSE_PROJECT_NAME.trim();
  }

  return path.basename(path.dirname(composeFile));
}

function getComposeServiceImageName(serviceName, { composeFile, env }) {
  return `${getComposeProjectName(composeFile, env)}-${serviceName}`;
}

function getBlueGreenCacheImageTag(commitShortHash, { composeFile, env }) {
  if (
    typeof commitShortHash !== 'string' ||
    commitShortHash.trim().length === 0
  ) {
    throw new Error('A commit short hash is required for cache image tagging.');
  }

  return `${getComposeProjectName(composeFile, env)}-web-cache:${commitShortHash.trim()}`;
}

async function retagCachedImageForService(
  cachedImageTag,
  serviceName,
  { composeFile, env, runCommand: run }
) {
  if (
    typeof cachedImageTag !== 'string' ||
    cachedImageTag.trim().length === 0
  ) {
    throw new Error('Cached recovery image tag is required.');
  }

  const serviceImageName = getComposeServiceImageName(serviceName, {
    composeFile,
    env,
  });

  await runChecked('docker', ['image', 'inspect', cachedImageTag], {
    env,
    runCommand: run,
    stdio: 'pipe',
  });
  await runChecked('docker', ['tag', cachedImageTag, serviceImageName], {
    env,
    runCommand: run,
  });

  return serviceImageName;
}

async function tagBlueGreenServiceImageForCache(
  serviceName,
  cacheImageTag,
  { composeFile, env, runCommand: run }
) {
  if (typeof cacheImageTag !== 'string' || cacheImageTag.trim().length === 0) {
    throw new Error('A cache image tag is required.');
  }

  const serviceImageName = getComposeServiceImageName(serviceName, {
    composeFile,
    env,
  });

  await runChecked('docker', ['image', 'inspect', serviceImageName], {
    env,
    runCommand: run,
    stdio: 'pipe',
  });
  await runChecked('docker', ['tag', serviceImageName, cacheImageTag], {
    env,
    runCommand: run,
  });

  return cacheImageTag;
}

function renderBlueGreenProxyConfig(
  color,
  { deploymentStamp = null, extraServerBlocks = [], standbyColor = null } = {}
) {
  const primaryServiceName = getBlueGreenServiceName(color);
  const primaryHiveServiceName = getBlueGreenHiveServiceName(color);
  const backupServiceName = standbyColor
    ? getBlueGreenServiceName(standbyColor)
    : null;
  const backupHiveServiceName = standbyColor
    ? getBlueGreenHiveServiceName(standbyColor)
    : null;
  const projectServerBlocks = Array.isArray(extraServerBlocks)
    ? extraServerBlocks.filter(
        (block) => typeof block === 'string' && block.trim().length > 0
      )
    : [];

  return [
    'map $http_upgrade $connection_upgrade {',
    '  default upgrade;',
    "  '' close;",
    '}',
    '',
    'resolver 127.0.0.11 ipv6=off valid=5s;',
    '',
    'log_format platform_blue_green_json escape=json',
    `  '{"time":"$time_iso8601","remoteAddr":"$remote_addr","host":"$host","method":"$request_method","path":"$request_uri","status":$status,"requestTime":$request_time,"upstreamResponseTime":"$upstream_response_time","upstreamAddr":"$upstream_addr","projectId":"$platform_project_id","selectedBranch":"$platform_selected_branch","upstreamService":"$platform_upstream_service","deploymentStamp":"$upstream_http_x_platform_deployment_stamp","deploymentColor":"$upstream_http_x_platform_blue_green_color","primaryColor":"${color}","standbyColor":"${standbyColor ?? 'none'}","userAgent":"$http_user_agent"}';`,
    'access_log /dev/stdout platform_blue_green_json;',
    'error_log /dev/stderr warn;',
    '',
    'upstream web_upstream {',
    '  zone web_upstream 64k;',
    `  server ${primaryServiceName}:7803 resolve max_fails=1 fail_timeout=5s;`,
    ...(backupServiceName
      ? [
          `  server ${backupServiceName}:7803 backup resolve max_fails=1 fail_timeout=5s;`,
        ]
      : []),
    '}',
    '',
    'upstream hive_app_upstream {',
    '  zone hive_app_upstream 64k;',
    `  server ${primaryHiveServiceName}:7814 resolve max_fails=1 fail_timeout=5s;`,
    ...(backupHiveServiceName
      ? [
          `  server ${backupHiveServiceName}:7814 backup resolve max_fails=1 fail_timeout=5s;`,
        ]
      : []),
    '}',
    '',
    'upstream hive_realtime_upstream {',
    '  zone hive_realtime_upstream 64k;',
    '  server hive-realtime:7815 resolve max_fails=1 fail_timeout=5s;',
    '}',
    '',
    'server {',
    '  listen 7803;',
    '  set $platform_project_id "platform";',
    '  set $platform_selected_branch "production";',
    `  set $platform_upstream_service "${primaryServiceName}";`,
    '  client_header_buffer_size 16k;',
    '  keepalive_timeout 15s;',
    '  large_client_header_buffers 8 16k;',
    `  add_header X-Platform-Deployment-Stamp "${deploymentStamp ?? 'unknown'}" always;`,
    `  add_header X-Platform-Blue-Green-Primary "${color}" always;`,
    `  add_header X-Platform-Blue-Green-Standby "${standbyColor ?? 'none'}" always;`,
    '',
    '  location / {',
    '    proxy_connect_timeout 3s;',
    `    proxy_buffer_size ${BLUE_GREEN_PROXY_RESPONSE_BUFFER_SIZE};`,
    `    proxy_buffers ${BLUE_GREEN_PROXY_RESPONSE_BUFFERS};`,
    `    proxy_busy_buffers_size ${BLUE_GREEN_PROXY_BUSY_BUFFER_SIZE};`,
    '    proxy_http_version 1.1;',
    '    proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;',
    '    proxy_next_upstream_tries 2;',
    '    proxy_pass http://web_upstream;',
    '    proxy_set_header Host $host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Proto $scheme;',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
    '}',
    '',
    'server {',
    '  listen 7803;',
    '  listen 7814;',
    '  server_name hive.tuturuuu.com;',
    '  set $platform_project_id "hive";',
    '  set $platform_selected_branch "production";',
    `  set $platform_upstream_service "${primaryHiveServiceName}";`,
    '  client_header_buffer_size 16k;',
    '  keepalive_timeout 15s;',
    '  large_client_header_buffers 8 16k;',
    `  add_header X-Platform-Deployment-Stamp "${deploymentStamp ?? 'unknown'}" always;`,
    `  add_header X-Platform-Blue-Green-Primary "${color}" always;`,
    `  add_header X-Platform-Blue-Green-Standby "${standbyColor ?? 'none'}" always;`,
    '',
    '  location /realtime {',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://hive_realtime_upstream;',
    '    proxy_set_header Host $host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Proto $scheme;',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
    '',
    '  location / {',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://hive_app_upstream;',
    '    proxy_set_header Host $host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Proto $scheme;',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
    '}',
    ...projectServerBlocks,
    '',
  ].join('\n');
}

function writeBlueGreenProxyConfig(
  color,
  {
    deploymentStamp = null,
    extraServerBlocks = [],
    fsImpl = fs,
    paths = getBlueGreenPaths(),
    standbyColor = null,
  } = {}
) {
  ensureBlueGreenRuntime(paths, fsImpl);
  fsImpl.writeFileSync(
    paths.proxyConfigFile,
    renderBlueGreenProxyConfig(color, {
      deploymentStamp,
      extraServerBlocks,
      standbyColor,
    }),
    'utf8'
  );
}

function getBlueGreenProdServices(parsed, targetColor) {
  return getBlueGreenProdServicesWithProxyOption(parsed, targetColor, true);
}

function getBlueGreenProdServicesWithProxyOption(
  parsed,
  targetColor,
  includeProxy = true
) {
  const services = [
    getBlueGreenServiceName(targetColor),
    ...getBlueGreenColorScopedSupportServices(targetColor),
    ...BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
  ];

  if (includeProxy) {
    services.unshift(BLUE_GREEN_PROXY_SERVICE);
  }

  if (hasComposeProfile(parsed.composeGlobalArgs, 'redis')) {
    services.push('redis', 'serverless-redis-http');
  }

  if (hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared')) {
    services.push(CLOUDFLARED_SERVICE);
  }

  return services;
}

function getExpectedBlueGreenProxyHostPortBindings(env = {}) {
  return BLUE_GREEN_PROXY_REQUIRED_HOST_PORTS.map(
    ({ containerPort, defaultHostPort, envKey }) => {
      const hostPort =
        typeof env[envKey] === 'string' && env[envKey].trim().length > 0
          ? env[envKey].trim()
          : defaultHostPort;

      return { containerPort, hostPort };
    }
  );
}

function hasExpectedHostPortBinding(ports, { containerPort, hostPort }) {
  const bindings = ports?.[`${containerPort}/tcp`];

  return (
    Array.isArray(bindings) &&
    bindings.some((binding) => String(binding?.HostPort ?? '') === hostPort)
  );
}

async function hasBlueGreenProxyHostPortBindings({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  const containerId = await getComposeServiceContainerId(
    BLUE_GREEN_PROXY_SERVICE,
    {
      composeFile,
      composeGlobalArgs,
      env,
      runCommand: run,
    }
  );

  if (!containerId) {
    return false;
  }

  try {
    const result = await runChecked(
      'docker',
      ['inspect', '-f', '{{json .NetworkSettings.Ports}}', containerId],
      {
        env,
        runCommand: run,
        stdio: 'pipe',
      }
    );
    const ports = JSON.parse(result.stdout.trim() || '{}');

    return getExpectedBlueGreenProxyHostPortBindings(env).every((binding) =>
      hasExpectedHostPortBinding(ports, binding)
    );
  } catch {
    return false;
  }
}

async function validateBlueGreenProxyConfig({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'exec',
      '-T',
      BLUE_GREEN_PROXY_SERVICE,
      'nginx',
      '-t'
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function reloadBlueGreenProxy({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'exec',
      '-T',
      BLUE_GREEN_PROXY_SERVICE,
      'nginx',
      '-s',
      'reload'
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function buildBlueGreenServices({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
  services,
}) {
  const buildArgs = getComposeCommandArgs(
    composeFile,
    composeGlobalArgs,
    'build',
    ...services
  );
  const freshBuildArgs = getComposeCommandArgs(
    composeFile,
    composeGlobalArgs,
    'build',
    '--no-cache',
    ...services
  );
  const timeoutMs = getBlueGreenBuildTimeoutMs(env);

  try {
    await runChecked('docker', buildArgs, {
      env,
      runCommand: run,
      timeoutMs,
    });
  } catch (error) {
    const isRecoverableBuildError =
      isBunTarballExtractionError(error) ||
      isBuildStallTimeoutError(error) ||
      isCachedBuildError(error);

    if (!isRecoverableBuildError) {
      throw error;
    }

    const recoveryReason = isBuildStallTimeoutError(error)
      ? BUILD_STALL_RECOVERY_REASON
      : isCachedBuildError(error)
        ? CACHED_BUILD_ERROR_RECOVERY_REASON
        : 'bun-tarball-extraction';

    await recoverBuildkitBunInstallCache({
      composeFile,
      composeGlobalArgs,
      env,
      reason: recoveryReason,
      runCommand: run,
    });

    await runChecked('docker', freshBuildArgs, {
      env,
      runCommand: run,
      timeoutMs,
    });
  }
}

async function refreshBlueGreenProxyIfRunning({
  env,
  envFilePath,
  fsImpl = fs,
  paths = getBlueGreenPaths(),
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const composeFile = getComposeFile('prod');
  const composeEnv = getComposeEnvironment({
    baseEnv: env ?? process.env,
    envFilePath,
    fsImpl,
    rootDir,
    withRedis: true,
  });
  const persistedActiveColor = readBlueGreenActiveColor(paths, fsImpl);
  const proxyActiveColor = readBlueGreenProxyActiveColor(paths, fsImpl);
  const activeColor = await resolveBlueGreenActiveColor(
    persistedActiveColor ?? proxyActiveColor,
    {
      composeFile,
      composeGlobalArgs: [],
      env: composeEnv,
      runCommand: run,
    }
  );

  if (!activeColor) {
    return false;
  }

  const proxyRunning = await hasComposeServiceContainer(
    BLUE_GREEN_PROXY_SERVICE,
    {
      composeFile,
      composeGlobalArgs: [],
      env: composeEnv,
      runCommand: run,
    }
  );

  if (!proxyRunning) {
    return false;
  }

  if (activeColor !== persistedActiveColor) {
    writeBlueGreenActiveColor(activeColor, paths, fsImpl);
  }

  const standbyColor = await resolveBlueGreenStandbyColor(activeColor, {
    composeFile,
    composeGlobalArgs: [],
    env: composeEnv,
    runCommand: run,
  });

  writeBlueGreenProxyConfig(activeColor, {
    deploymentStamp: readBlueGreenDeploymentStamp(paths, fsImpl),
    fsImpl,
    paths,
    standbyColor,
  });
  await validateBlueGreenProxyConfig({
    composeFile,
    composeGlobalArgs: [],
    env: composeEnv,
    runCommand: run,
  });
  await reloadBlueGreenProxy({
    composeFile,
    composeGlobalArgs: [],
    env: composeEnv,
    runCommand: run,
  });
  await testBlueGreenProxyRouting({
    composeFile,
    composeGlobalArgs: [],
    env: composeEnv,
    runCommand: run,
  });

  return true;
}

async function testBlueGreenProxyRouting({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'exec',
      '-T',
      BLUE_GREEN_PROXY_SERVICE,
      'wget',
      '-q',
      '-O',
      '/dev/null',
      `http://127.0.0.1:7803${BLUE_GREEN_DRAIN_STATUS_PATH}`
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function testBlueGreenHiveProxyRouting({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'exec',
      '-T',
      BLUE_GREEN_PROXY_SERVICE,
      'wget',
      '-q',
      '-O',
      '/dev/null',
      'http://127.0.0.1:7814/login'
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function removeLegacyHiveContainerIfPresent({
  composeFile,
  env,
  runCommand: run,
}) {
  const containerName = getComposeServiceContainerName(LEGACY_HIVE_SERVICE, {
    composeFile,
    env,
  });
  const inspect = await run(
    'docker',
    [
      'ps',
      '-aq',
      '--filter',
      `name=^/${containerName}$`,
      '--format',
      '{{.ID}}',
    ],
    {
      env,
      stdio: 'pipe',
    }
  );

  if (inspect.code !== 0 || inspect.stdout.trim().length === 0) {
    return false;
  }

  await runChecked('docker', ['rm', '-f', containerName], {
    env,
    runCommand: run,
  });

  return true;
}

async function finalizeBlueGreenComposeMigration({
  composeFile,
  composeGlobalArgs = [],
  deadlineMs = BLUE_GREEN_MIGRATION_PROXY_HANDOFF_TIMEOUT_MS,
  migration,
  now = () => Date.now(),
  runCommand: run = runCommand,
} = {}) {
  if (!migration) {
    return null;
  }

  await testBlueGreenProxyRouting({
    composeFile,
    composeGlobalArgs,
    env: migration.targetEnv,
    runCommand: run,
  });

  const handoffStartedAt = now();

  try {
    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'stop',
        '--timeout',
        '1',
        BLUE_GREEN_PROXY_SERVICE
      ),
      {
        env: migration.sourceEnv,
        runCommand: run,
      }
    );
    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'up',
        '--detach',
        '--no-build',
        '--force-recreate',
        BLUE_GREEN_PROXY_SERVICE
      ),
      {
        env: migration.targetFinalEnv,
        runCommand: run,
      }
    );
    await testBlueGreenProxyRouting({
      composeFile,
      composeGlobalArgs,
      env: migration.targetFinalEnv,
      runCommand: run,
    });

    const handoffDurationMs = now() - handoffStartedAt;
    if (handoffDurationMs > deadlineMs) {
      throw new Error(
        `Proxy handoff exceeded ${deadlineMs}ms (${handoffDurationMs}ms).`
      );
    }

    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        ['--profile', 'redis', '--profile', 'cloudflared'],
        'down',
        '--remove-orphans'
      ),
      {
        env: migration.sourceEnv,
        runCommand: run,
      }
    );

    return {
      handoffDurationMs,
      sourceProjectName: migration.sourceProjectName,
      status: 'completed',
      targetProjectName: migration.targetProjectName,
    };
  } catch (error) {
    const failureMessage =
      error instanceof Error ? error.message : String(error);

    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'stop',
        '--timeout',
        '1',
        BLUE_GREEN_PROXY_SERVICE
      ),
      {
        env: migration.targetFinalEnv,
        runCommand: run,
      }
    );
    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'up',
        '--detach',
        '--no-build',
        BLUE_GREEN_PROXY_SERVICE
      ),
      {
        env: migration.sourceEnv,
        runCommand: run,
      }
    );
    await testBlueGreenProxyRouting({
      composeFile,
      composeGlobalArgs,
      env: migration.sourceEnv,
      runCommand: run,
    });

    console.error(
      `Proxy migration from ${migration.sourceProjectName} to ${migration.targetProjectName} failed; legacy proxy was restored: ${failureMessage}`
    );

    return {
      error: failureMessage,
      sourceProjectName: migration.sourceProjectName,
      status: 'rolled-back',
      targetProjectName: migration.targetProjectName,
    };
  }
}

async function getBlueGreenServiceDrainStatus(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const result = await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'exec',
      '-T',
      serviceName,
      'node',
      '-e',
      `fetch('http://127.0.0.1:7803${BLUE_GREEN_DRAIN_STATUS_PATH}', { cache: 'no-store' }).then(async (response) => { if (!response.ok) { throw new Error(\`Unexpected status \${response.status}\`); } process.stdout.write(await response.text()); }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });`
    ),
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return JSON.parse(result.stdout.trim());
}

async function waitForBlueGreenServiceDrain(
  serviceName,
  {
    composeFile,
    composeGlobalArgs = [],
    env,
    pollMs = BLUE_GREEN_DRAIN_POLL_MS,
    proxyDrainMs = BLUE_GREEN_PROXY_DRAIN_MS,
    runCommand: run,
    timeoutMs = BLUE_GREEN_DRAIN_TIMEOUT_MS,
  }
) {
  const fallbackDelayMs = Math.max(0, proxyDrainMs);

  try {
    const deadline = Date.now() + timeoutMs;
    let lastInflightRequests = Number.POSITIVE_INFINITY;

    while (Date.now() <= deadline) {
      const status = await getBlueGreenServiceDrainStatus(serviceName, {
        composeFile,
        composeGlobalArgs,
        env,
        runCommand: run,
      });
      lastInflightRequests =
        typeof status?.inflightRequests === 'number'
          ? status.inflightRequests
          : Number.POSITIVE_INFINITY;

      if (lastInflightRequests <= 0) {
        return;
      }

      await sleep(pollMs);
    }

    throw new Error(
      `${serviceName} still has ${lastInflightRequests} in-flight requests after ${timeoutMs}ms.`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      fallbackDelayMs > 0 &&
      (/Unexpected status 404/.test(message) ||
        message.includes(BLUE_GREEN_DRAIN_STATUS_PATH))
    ) {
      await sleep(fallbackDelayMs);
      return;
    }

    throw error;
  }
}

async function resolveBlueGreenActiveColor(
  persistedActiveColor,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const candidateColors = [
    persistedActiveColor,
    persistedActiveColor ? getNextBlueGreenColor(persistedActiveColor) : null,
  ].filter(Boolean);

  for (const color of candidateColors) {
    if (
      await isComposeServiceHealthy(getBlueGreenServiceName(color), {
        composeFile,
        composeGlobalArgs,
        env,
        runCommand: run,
      })
    ) {
      return color;
    }
  }

  return null;
}

async function resolveBlueGreenStandbyColor(
  activeColor,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  if (!activeColor) {
    return null;
  }

  const standbyColor = getNextBlueGreenColor(activeColor);

  return (await isComposeServiceHealthy(getBlueGreenServiceName(standbyColor), {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  }))
    ? standbyColor
    : null;
}

async function runBlueGreenProdWorkflow(parsed, options = {}) {
  const composeFile = getComposeFile(parsed.mode);
  const baseEnv = getComposeEnvironment({
    baseEnv: options.env ?? process.env,
    envFilePath: options.envFilePath,
    fsImpl: options.fsImpl ?? fs,
    rootDir: options.rootDir,
    withCloudflared: hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared'),
    withRedis: hasComposeProfile(parsed.composeGlobalArgs, 'redis'),
    withSupportServices: true,
  });
  const fsImpl = options.fsImpl ?? fs;
  const paths = getBlueGreenPaths(options.rootDir ?? ROOT_DIR);
  const run = options.runCommand ?? runCommand;
  const migration = await getBlueGreenComposeMigration({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: baseEnv,
    rootDir: options.rootDir ?? ROOT_DIR,
    runCommand: run,
  });
  const env = migration?.targetEnv ?? baseEnv;
  const persistedActiveColor = readBlueGreenActiveColor(paths, fsImpl);
  const proxyActiveColor = readBlueGreenProxyActiveColor(paths, fsImpl);
  const proxyDrainMs = options.proxyDrainMs ?? BLUE_GREEN_PROXY_DRAIN_MS;
  const drainPollMs = options.drainPollMs ?? BLUE_GREEN_DRAIN_POLL_MS;
  const drainTimeoutMs = options.drainTimeoutMs ?? BLUE_GREEN_DRAIN_TIMEOUT_MS;
  const deploymentStamp =
    options.deploymentStamp ?? generateBlueGreenDeploymentStamp();
  const activeColor = await resolveBlueGreenActiveColor(
    persistedActiveColor ?? proxyActiveColor,
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  );
  const proxyRunning = await hasComposeServiceContainer(
    BLUE_GREEN_PROXY_SERVICE,
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  );
  const proxyHasRequiredHostPorts =
    proxyRunning &&
    (await hasBlueGreenProxyHostPortBindings({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }));
  const needsProxyHostPortRefresh = proxyRunning && !proxyHasRequiredHostPorts;
  const targetColor = getNextBlueGreenColor(activeColor);
  const initialProxyColor = activeColor ?? targetColor;
  const standbyColor = activeColor;
  const targetEnv = {
    ...env,
    PLATFORM_BLUE_GREEN_COLOR: targetColor,
    PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
  };
  const needsProxyBootstrap =
    !!migration || !proxyRunning || needsProxyHostPortRefresh;

  if (needsProxyBootstrap) {
    writeBlueGreenProxyConfig(initialProxyColor, {
      deploymentStamp:
        readBlueGreenDeploymentStamp(paths, fsImpl) ?? deploymentStamp,
      fsImpl,
      paths,
      standbyColor:
        activeColor &&
        (await resolveBlueGreenStandbyColor(activeColor, {
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env,
          runCommand: run,
        })),
    });
  }

  const targetServices = getBlueGreenProdServicesWithProxyOption(
    parsed,
    targetColor,
    needsProxyBootstrap
  );
  const { phase1Services, phase2Services } =
    splitBlueGreenProdServicePhases(targetServices);

  await buildBlueGreenServices({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: targetEnv,
    runCommand: run,
    services: targetServices,
  });

  await removeLegacyHiveContainerIfPresent({
    composeFile,
    env,
    runCommand: run,
  });

  await stopComposeServicesIfPresent(['web'], {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env,
    runCommand: run,
  });

  await stopComposeServicesIfPresent(
    [
      getBlueGreenServiceName(targetColor),
      getBlueGreenHiveServiceName(targetColor),
    ],
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  );
  await removeComposeServicesIfPresent(
    [
      getBlueGreenServiceName(targetColor),
      getBlueGreenHiveServiceName(targetColor),
    ],
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  );

  await runComposeUpWithNameConflictRecovery({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: targetEnv,
    fsImpl,
    runCommand: run,
    services: phase1Services,
    upArgs: [
      'up',
      '--detach',
      '--no-build',
      ...(needsProxyHostPortRefresh ? ['--force-recreate'] : []),
      '--remove-orphans',
      ...parsed.composeArgs,
      ...phase1Services,
    ],
  });

  if (phase2Services.length > 0) {
    await runComposeUpWithNameConflictRecovery({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: targetEnv,
      fsImpl,
      runCommand: run,
      services: phase2Services,
      upArgs: [
        'up',
        '--detach',
        '--no-build',
        '--remove-orphans',
        ...parsed.composeArgs,
        ...phase2Services,
      ],
    });
  }

  await waitForComposeServiceHealthy(getBlueGreenServiceName(targetColor), {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: targetEnv,
    runCommand: run,
  });

  for (const serviceName of getBlueGreenPromotionHealthGateServices(
    targetColor
  )) {
    await waitForComposeServiceHealthy(serviceName, {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: targetEnv,
      runCommand: run,
    });
  }

  if (needsProxyBootstrap) {
    await waitForComposeServiceHealthy(BLUE_GREEN_PROXY_SERVICE, {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: targetEnv,
      runCommand: run,
    });
  }

  writeBlueGreenDeploymentStamp(deploymentStamp, paths, fsImpl);

  if (initialProxyColor !== targetColor) {
    writeBlueGreenProxyConfig(targetColor, {
      deploymentStamp,
      fsImpl,
      paths,
      standbyColor,
    });
    await validateBlueGreenProxyConfig({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: targetEnv,
      runCommand: run,
    });
    await reloadBlueGreenProxy({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: targetEnv,
      runCommand: run,
    });
  } else {
    writeBlueGreenProxyConfig(targetColor, {
      deploymentStamp,
      fsImpl,
      paths,
      standbyColor:
        standbyColor ??
        (await resolveBlueGreenStandbyColor(targetColor, {
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          runCommand: run,
        })),
    });
  }

  await testBlueGreenProxyRouting({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: targetEnv,
    runCommand: run,
  });
  await testBlueGreenHiveProxyRouting({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: targetEnv,
    runCommand: run,
  });

  writeBlueGreenActiveColor(targetColor, paths, fsImpl);

  if (activeColor && activeColor !== targetColor) {
    await waitForBlueGreenServiceDrain(getBlueGreenServiceName(activeColor), {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      pollMs: drainPollMs,
      proxyDrainMs,
      runCommand: run,
      timeoutMs: drainTimeoutMs,
    });
  }

  return {
    migration: await finalizeBlueGreenComposeMigration({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      migration,
      now: options.now,
      runCommand: run,
    }),
  };
}

async function runBlueGreenStandbyRefreshWorkflow(parsed, options = {}) {
  const composeFile = getComposeFile(parsed.mode);
  const env = getComposeEnvironment({
    baseEnv: options.env ?? process.env,
    envFilePath: options.envFilePath,
    fsImpl: options.fsImpl ?? fs,
    rootDir: options.rootDir,
    withCloudflared: hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared'),
    withRedis: hasComposeProfile(parsed.composeGlobalArgs, 'redis'),
    withSupportServices: true,
  });
  const fsImpl = options.fsImpl ?? fs;
  const paths = getBlueGreenPaths(options.rootDir ?? ROOT_DIR);
  const run = options.runCommand ?? runCommand;
  const activeColor = await resolveBlueGreenActiveColor(
    readBlueGreenActiveColor(paths, fsImpl) ??
      readBlueGreenProxyActiveColor(paths, fsImpl),
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  );

  if (!activeColor) {
    return {
      activeColor: null,
      deploymentStamp: readBlueGreenDeploymentStamp(paths, fsImpl),
      refreshedStandby: false,
      standbyColor: null,
    };
  }

  const standbyColor = getNextBlueGreenColor(activeColor);
  const deploymentStamp =
    readBlueGreenDeploymentStamp(paths, fsImpl) ??
    options.deploymentStamp ??
    generateBlueGreenDeploymentStamp();
  const standbyEnv = {
    ...env,
    PLATFORM_BLUE_GREEN_COLOR: standbyColor,
    PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
  };
  const standbyServices = getBlueGreenProdServicesWithProxyOption(
    parsed,
    standbyColor,
    false
  );

  await buildBlueGreenServices({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
    services: standbyServices,
  });

  await stopComposeServicesIfPresent(
    [
      getBlueGreenServiceName(standbyColor),
      getBlueGreenHiveServiceName(standbyColor),
    ],
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  );
  await removeComposeServicesIfPresent(
    [
      getBlueGreenServiceName(standbyColor),
      getBlueGreenHiveServiceName(standbyColor),
    ],
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  );

  const { phase1Services: standbyPhase1, phase2Services: standbyPhase2 } =
    splitBlueGreenProdServicePhases(standbyServices);

  await runComposeUpWithNameConflictRecovery({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    fsImpl,
    runCommand: run,
    services: standbyPhase1,
    upArgs: [
      'up',
      '--detach',
      '--no-build',
      '--remove-orphans',
      ...parsed.composeArgs,
      ...standbyPhase1,
    ],
  });

  if (standbyPhase2.length > 0) {
    await runComposeUpWithNameConflictRecovery({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: standbyEnv,
      fsImpl,
      runCommand: run,
      services: standbyPhase2,
      upArgs: [
        'up',
        '--detach',
        '--no-build',
        '--remove-orphans',
        ...parsed.composeArgs,
        ...standbyPhase2,
      ],
    });
  }

  await waitForComposeServiceHealthy(getBlueGreenServiceName(standbyColor), {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
  });

  for (const serviceName of getBlueGreenPromotionHealthGateServices(
    standbyColor
  )) {
    await waitForComposeServiceHealthy(serviceName, {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: standbyEnv,
      runCommand: run,
    });
  }

  writeBlueGreenDeploymentStamp(deploymentStamp, paths, fsImpl);

  await refreshBlueGreenProxyIfRunning({
    env: standbyEnv,
    envFilePath: options.envFilePath,
    fsImpl,
    paths,
    rootDir: options.rootDir ?? ROOT_DIR,
    runCommand: run,
  });

  return {
    activeColor,
    deploymentStamp,
    refreshedStandby: true,
    standbyColor,
  };
}

async function runBlueGreenCachedRecoveryWorkflow(parsed, options = {}) {
  const composeFile = getComposeFile(parsed.mode);
  const env = getComposeEnvironment({
    baseEnv: options.env ?? process.env,
    envFilePath: options.envFilePath,
    fsImpl: options.fsImpl ?? fs,
    rootDir: options.rootDir,
    withCloudflared: hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared'),
    withRedis: hasComposeProfile(parsed.composeGlobalArgs, 'redis'),
    withSupportServices: true,
  });
  const fsImpl = options.fsImpl ?? fs;
  const paths = getBlueGreenPaths(options.rootDir ?? ROOT_DIR);
  const run = options.runCommand ?? runCommand;
  const cachedImageTag = options.cachedImageTag;
  const persistedActiveColor =
    readBlueGreenActiveColor(paths, fsImpl) ??
    readBlueGreenProxyActiveColor(paths, fsImpl);
  const activeColor = persistedActiveColor ?? 'blue';
  const standbyColor = getNextBlueGreenColor(activeColor);
  const deploymentStamp =
    options.deploymentStamp ??
    readBlueGreenDeploymentStamp(paths, fsImpl) ??
    generateBlueGreenDeploymentStamp();
  const activeServiceName = getBlueGreenServiceName(activeColor);
  const standbyServiceName = getBlueGreenServiceName(standbyColor);
  const activeEnv = {
    ...env,
    PLATFORM_BLUE_GREEN_COLOR: activeColor,
    PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
  };
  const standbyEnv = {
    ...env,
    PLATFORM_BLUE_GREEN_COLOR: standbyColor,
    PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
  };
  const activeServices = [
    BLUE_GREEN_PROXY_SERVICE,
    activeServiceName,
    ...getBlueGreenColorScopedSupportServices(activeColor),
  ];
  const standbyServices = [
    standbyServiceName,
    getBlueGreenHiveServiceName(standbyColor),
  ];

  writeBlueGreenProxyConfig(activeColor, {
    deploymentStamp,
    fsImpl,
    paths,
    standbyColor: null,
  });

  await retagCachedImageForService(cachedImageTag, activeServiceName, {
    composeFile,
    env: activeEnv,
    runCommand: run,
  });
  await removeLegacyHiveContainerIfPresent({
    composeFile,
    env,
    runCommand: run,
  });
  await runComposeUpWithNameConflictRecovery({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    fsImpl,
    runCommand: run,
    services: activeServices,
    upArgs: [
      'up',
      '--detach',
      '--no-build',
      '--remove-orphans',
      ...activeServices,
    ],
  });

  await waitForComposeServiceHealthy(BLUE_GREEN_PROXY_SERVICE, {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    runCommand: run,
  });
  await waitForComposeServiceHealthy(activeServiceName, {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    runCommand: run,
  });
  for (const serviceName of getBlueGreenColorScopedSupportServices(
    activeColor
  )) {
    await waitForComposeServiceHealthy(serviceName, {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: activeEnv,
      runCommand: run,
    });
  }

  writeBlueGreenDeploymentStamp(deploymentStamp, paths, fsImpl);
  writeBlueGreenActiveColor(activeColor, paths, fsImpl);
  await validateBlueGreenProxyConfig({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    runCommand: run,
  });
  await reloadBlueGreenProxy({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    runCommand: run,
  });
  await testBlueGreenProxyRouting({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    runCommand: run,
  });
  await testBlueGreenHiveProxyRouting({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    runCommand: run,
  });

  await retagCachedImageForService(cachedImageTag, standbyServiceName, {
    composeFile,
    env: standbyEnv,
    runCommand: run,
  });
  await runComposeUpWithNameConflictRecovery({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    fsImpl,
    runCommand: run,
    services: standbyServices,
    upArgs: [
      'up',
      '--detach',
      '--no-build',
      '--remove-orphans',
      ...standbyServices,
    ],
  });
  await waitForComposeServiceHealthy(standbyServiceName, {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
  });
  await waitForComposeServiceHealthy(
    getBlueGreenHiveServiceName(standbyColor),
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: standbyEnv,
      runCommand: run,
    }
  );

  writeBlueGreenProxyConfig(activeColor, {
    deploymentStamp,
    fsImpl,
    paths,
    standbyColor,
  });
  await validateBlueGreenProxyConfig({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
  });
  await reloadBlueGreenProxy({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
  });
  await testBlueGreenProxyRouting({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
  });
  await testBlueGreenHiveProxyRouting({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
  });

  return {
    activeColor,
    cachedImageTag,
    deploymentStamp,
    refreshedStandby: true,
    standbyColor,
  };
}

module.exports = {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_DRAIN_POLL_MS,
  BLUE_GREEN_DRAIN_STATUS_PATH,
  BLUE_GREEN_DRAIN_TIMEOUT_MS,
  BLUE_GREEN_PROXY_CONFIG_FILE,
  BLUE_GREEN_PROXY_DRAIN_MS,
  BLUE_GREEN_PROXY_SERVICE,
  CLOUDFLARED_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
  BLUE_GREEN_STAMP_FILE,
  BLUE_GREEN_DEFERRED_SUPPORT_SERVICES,
  BLUE_GREEN_SUPPORT_SERVICES,
  BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
  DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS,
  buildBlueGreenServices,
  clearBlueGreenRuntime,
  ensureBlueGreenRuntime,
  generateBlueGreenDeploymentStamp,
  getBlueGreenCacheImageTag,
  getBlueGreenPaths,
  getBlueGreenBuildTimeoutMs,
  getBlueGreenComposeMigration,
  getBlueGreenHiveServiceName,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  hasBlueGreenProxyHostPortBindings,
  readBlueGreenDeploymentStamp,
  getBlueGreenServiceName,
  getBlueGreenServiceDrainStatus,
  getNextBlueGreenColor,
  isBlueGreenColor,
  readBlueGreenActiveColor,
  readBlueGreenProxyActiveColor,
  refreshBlueGreenProxyIfRunning,
  finalizeBlueGreenComposeMigration,
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  resolveBlueGreenStandbyColor,
  runBlueGreenProdWorkflow,
  runBlueGreenCachedRecoveryWorkflow,
  runBlueGreenStandbyRefreshWorkflow,
  sleep,
  splitBlueGreenProdServicePhases,
  tagBlueGreenServiceImageForCache,
  testBlueGreenProxyRouting,
  testBlueGreenHiveProxyRouting,
  validateBlueGreenProxyConfig,
  waitForBlueGreenServiceDrain,
  writeBlueGreenActiveColor,
  writeBlueGreenDeploymentStamp,
  writeBlueGreenProxyConfig,
};
