const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const {
  getComposeCommandArgs,
  getComposeFile,
  getComposeServiceContainerId,
  getComposeServiceContainerName,
  hasComposeProfile,
  hasComposeServiceContainer,
  isComposeServiceHealthy,
  removeComposeServiceContainersByLabelIfPresent,
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
  ensureProductionSupabaseOrigin,
  getComposeEnvironment,
  getDockerWebComposeProjectName,
  LEGACY_DOCKER_WEB_COMPOSE_PROJECT_NAME,
} = require('./env.js');
const {
  BUILD_STALL_RECOVERY_REASON,
  BUILDKIT_SERVICE_NAME,
  CACHED_BUILD_ERROR_RECOVERY_REASON,
  getAutoBuildMemory,
  getResolvedBuildkitComposeEnv,
  isBuildStallTimeoutError,
  isBunTarballExtractionError,
  isCachedBuildError,
  isTransientDockerRegistryError,
  cleanupBuildkitAfterBuild,
  ensureBuildkitBuilder,
  recoverBuildkitBunInstallCache,
} = require('./buildkit-builder.js');
const {
  BUILD_RESOURCE_PROFILE_REASON_ENV,
  applyBuildResourceProfileToEnv,
  getBuildResourceProfileFromEnv,
  getBuildResourceProfilePathsFromEnv,
  getNextAdaptiveBuildResourceProfile,
  getRecommendedBuildResourceProfile,
  isAdaptiveBuildResourceProfileEnabled,
  isBuildkitMemoryExhaustionError,
  isBuildkitResourceProfileFallbackError,
  persistBuildResourceProfile,
} = require('./resource-profiles.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DOCKER_WEB_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web');
const BLUE_GREEN_RUNTIME_DIR = path.join(DOCKER_WEB_RUNTIME_DIR, 'prod');
const BLUE_GREEN_PROXY_CONFIG_FILE = path.join(
  BLUE_GREEN_RUNTIME_DIR,
  'nginx.conf'
);
const BLUE_GREEN_BAKE_FILE = path.join(ROOT_DIR, 'docker-bake.web.prod.hcl');
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
const HIVE_DB_MIGRATE_SERVICE = 'hive-db-migrate';
const SUPERMEMORY_DB_MIGRATE_SERVICE = 'supermemory-db-migrate';
const DB_MIGRATE_SERVICES = Object.freeze([
  HIVE_DB_MIGRATE_SERVICE,
  SUPERMEMORY_DB_MIGRATE_SERVICE,
]);
const PLATFORM_BUILD_METADATA_ENV_NAMES = Object.freeze([
  'PLATFORM_BUILD_BUILT_AT',
  'PLATFORM_BUILD_COMMIT_HASH',
  'PLATFORM_BUILD_COMMIT_MESSAGE',
  'PLATFORM_BUILD_COMMIT_SHORT_HASH',
  'PLATFORM_BUILD_ENVIRONMENT',
  'PLATFORM_BUILD_REF_NAME',
]);

function getBlueGreenProductionComposeEnvironment(options = {}) {
  const composeEnv = getComposeEnvironment({
    ...options,
    preferEnvFilePath: true,
  });

  ensureProductionSupabaseOrigin({
    ...options,
    composeEnv,
  });

  return composeEnv;
}

function getComposeFileForRoot(mode = 'dev', rootDir = ROOT_DIR) {
  const composeFile = getComposeFile(mode);

  if (path.resolve(rootDir) === ROOT_DIR) {
    return composeFile;
  }

  return path.join(rootDir, path.relative(ROOT_DIR, composeFile));
}

/** Started after the core web/support services so Hive can warm independently. */
const BLUE_GREEN_DEFERRED_SUPPORT_SERVICES = Object.freeze([
  'hive-blue',
  'hive-green',
  'hive-realtime',
  'meet-realtime',
]);
/** Support sidecars that gate blue/green promotion (Hive warms independently). */
const BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE = Object.freeze([
  'backend',
  'markitdown',
  'storage-unzip-proxy',
  'supermemory',
  'web-docker-control',
  'web-cron-runner',
]);
const BLUE_GREEN_SUPPORT_SERVICES = Object.freeze([
  ...BLUE_GREEN_DEFERRED_SUPPORT_SERVICES,
  ...BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
]);
const BLUE_GREEN_SUPPORT_BUILD_SERVICE_NAMES = Object.freeze([
  'backend',
  'hive',
  'hive-realtime',
  'meet-realtime',
  'markitdown',
  'storage-unzip-proxy',
  'supermemory',
  'web-docker-control',
  'web-cron-runner',
]);
const BLUE_GREEN_BUILD_HASH_VERSION = 1;
const DEFAULT_BLUE_GREEN_BUILD_RETRY_MAX_ATTEMPTS = 4;
const DEFAULT_BLUE_GREEN_BUILD_RETRY_INITIAL_DELAY_MS = 5_000;
const DEFAULT_BLUE_GREEN_BUILD_RETRY_MAX_DELAY_MS = 60_000;
const BLUE_GREEN_FORCE_SUPPORT_BUILD_PATHS = Object.freeze([
  '.dockerignore',
  'bun.lock',
  'docker-compose.web.prod.yml',
  'docker-compose/compose.web.prod.sidecars.yml',
  'docker-compose/compose.web.prod.web.yml',
  'package.json',
  'turbo.json',
]);
const BLUE_GREEN_HIVE_BUILD_PATHS = Object.freeze([
  'apps/hive/db/',
  'apps/hive/',
  'packages/ai/',
  'packages/auth/',
  'packages/icons/',
  'packages/internal-api/',
  'packages/offline/',
  'packages/realtime/',
  'packages/satellite/',
  'packages/supabase/',
  'packages/types/',
  'packages/ui/',
  'packages/utils/',
  'packages/vercel/',
]);
const BLUE_GREEN_HIVE_REALTIME_BUILD_PATHS = Object.freeze([
  'apps/hive-realtime/',
  'packages/realtime/',
  'packages/types/',
]);
const BLUE_GREEN_BACKEND_BUILD_PATHS = Object.freeze(['apps/backend/']);
const BLUE_GREEN_MEET_REALTIME_BUILD_PATHS = Object.freeze([
  'apps/meet-realtime/',
  'packages/realtime/',
]);
const BLUE_GREEN_MARKITDOWN_BUILD_PATHS = Object.freeze(['apps/discord/']);
const BLUE_GREEN_STORAGE_UNZIP_PROXY_BUILD_PATHS = Object.freeze([
  'apps/storage-unzip-proxy/',
]);
const BLUE_GREEN_SUPERMEMORY_BUILD_PATHS = Object.freeze(['apps/supermemory/']);
const BLUE_GREEN_WEB_CRON_RUNNER_BUILD_PATHS = Object.freeze([
  'apps/web/docker/cron-runner-entrypoint.js',
  'apps/web/docker/cron-runner.Dockerfile',
  'docker-compose/compose.web.prod.ops.yml',
]);
const BLUE_GREEN_WEB_DOCKER_CONTROL_BUILD_PATHS = Object.freeze([
  'apps/web/docker/docker-control-recovery.js',
  'apps/web/docker/docker-control-server.js',
  'apps/web/docker/docker-control.Dockerfile',
  'docker-compose/compose.web.prod.ops.yml',
]);
const BLUE_GREEN_COLORS = ['blue', 'green'];
const BLUE_GREEN_FRONTENDS = Object.freeze({
  next: {
    cacheLabel: 'web',
    port: '7803',
    servicePrefix: 'web',
  },
  tanstack: {
    cacheLabel: 'tanstack-web',
    port: '7824',
    servicePrefix: 'tanstack-web',
  },
});
const DEFAULT_BLUE_GREEN_FRONTEND = 'next';
const LEGACY_HIVE_SERVICE = 'hive';
const BLUE_GREEN_PROXY_DRAIN_MS = 20_000;
const BLUE_GREEN_CLIENT_HEADER_BUFFER_SIZE = '64k';
const BLUE_GREEN_LARGE_CLIENT_HEADER_BUFFERS = '8 64k';
const BLUE_GREEN_PROXY_RESPONSE_BUFFER_SIZE = '128k';
const BLUE_GREEN_PROXY_RESPONSE_BUFFERS = '8 128k';
const BLUE_GREEN_PROXY_BUSY_BUFFER_SIZE = '256k';
const BLUE_GREEN_PROXY_ROUTE_CHECK_ATTEMPTS = 6;
const BLUE_GREEN_PROXY_ROUTE_CHECK_DELAY_MS = 2_000;
const BLUE_GREEN_BROWSER_STATE_RECOVERY_PATH = '/~recover-browser-state';
const BLUE_GREEN_CLEAR_SITE_DATA_VALUE =
  '"cache", "storage", "executionContexts"';
const BLUE_GREEN_MIGRATION_PROXY_HANDOFF_TIMEOUT_MS = 3_000;
const DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS = 45 * 60_000;
const BLUE_GREEN_MIGRATION_STAGING_PORT_ENV = {
  DOCKER_WEB_BUILDKIT_PORT: '17914',
  DOCKER_WEB_DIRECT_HOST_PORT: '17804',
  DOCKER_HIVE_PROXY_HOST_PORT: '17814',
  DOCKER_MEET_REALTIME_PROXY_HOST_PORT: '17816',
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
  {
    containerPort: '7816',
    defaultHostPort: '7816',
    envKey: 'DOCKER_MEET_REALTIME_PROXY_HOST_PORT',
  },
]);
const BLUE_GREEN_PROXY_HOST_IP = '127.0.0.1';

function isExplicitFalseEnvValue(value) {
  return /^(0|false|no|off)$/iu.test(String(value ?? '').trim());
}

function isBlueGreenSupermemoryEnabled(env = {}) {
  const configuredValue =
    typeof env.SUPERMEMORY_ENABLED === 'string'
      ? env.SUPERMEMORY_ENABLED
      : env.DOCKER_SUPERMEMORY_ENABLED;

  return !isExplicitFalseEnvValue(configuredValue);
}

function isBlueGreenCronRunnerEnabled(env = {}) {
  return !isExplicitFalseEnvValue(env.DOCKER_WEB_CRON_RUNNER_ENABLED);
}

function getBlueGreenHealthGateSupportServices(env = {}) {
  const services = isBlueGreenSupermemoryEnabled(env)
    ? [...BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE]
    : BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE.filter(
        (serviceName) => serviceName !== 'supermemory'
      );

  return isBlueGreenCronRunnerEnabled(env)
    ? services
    : services.filter((serviceName) => serviceName !== 'web-cron-runner');
}

function getBlueGreenSupportBuildServiceNames(env = {}) {
  const services = isBlueGreenSupermemoryEnabled(env)
    ? [...BLUE_GREEN_SUPPORT_BUILD_SERVICE_NAMES]
    : BLUE_GREEN_SUPPORT_BUILD_SERVICE_NAMES.filter(
        (serviceName) => serviceName !== 'supermemory'
      );

  return isBlueGreenCronRunnerEnabled(env)
    ? services
    : services.filter((serviceName) => serviceName !== 'web-cron-runner');
}

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

function getBlueGreenProxyBootstrapUpArgs(
  parsed,
  services,
  { forceRecreate = false } = {}
) {
  return [
    'up',
    '--detach',
    '--no-build',
    ...(forceRecreate ? ['--force-recreate'] : []),
    '--remove-orphans',
    ...parsed.composeArgs,
    ...services,
  ];
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
    DOCKER_MEET_REALTIME_PROXY_HOST_PORT: '7816',
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
    buildHashesFile: path.join(runtimeDir, 'build-input-hashes.json'),
    buildHashHistoryFile: path.join(
      runtimeDir,
      'build-input-hashes.history.json'
    ),
    deploymentStampFile: path.join(runtimeDir, 'deployment-stamp'),
    proxyConfigFile: path.join(runtimeDir, 'nginx.conf'),
    runtimeDir,
    stateFile: path.join(runtimeDir, 'active-color'),
    targetStateFile: path.join(runtimeDir, 'target-state.json'),
  };
}

function ensureBlueGreenRuntime(paths = getBlueGreenPaths(), fsImpl = fs) {
  fsImpl.mkdirSync(paths.runtimeDir, { recursive: true });
}

function isBlueGreenColor(value) {
  return BLUE_GREEN_COLORS.includes(value);
}

function normalizeBlueGreenFrontend(value) {
  const frontend = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!frontend) {
    return DEFAULT_BLUE_GREEN_FRONTEND;
  }

  if (Object.hasOwn(BLUE_GREEN_FRONTENDS, frontend)) {
    return frontend;
  }

  throw new Error(
    `Unsupported Docker web frontend "${value}". Expected one of: ${Object.keys(
      BLUE_GREEN_FRONTENDS
    ).join(', ')}.`
  );
}

function getBlueGreenFrontend(envOrFrontend = process.env) {
  if (typeof envOrFrontend === 'string') {
    return normalizeBlueGreenFrontend(envOrFrontend);
  }

  return normalizeBlueGreenFrontend(envOrFrontend?.DOCKER_WEB_FRONTEND);
}

function getBlueGreenFrontendConfig(envOrFrontend = process.env) {
  return BLUE_GREEN_FRONTENDS[getBlueGreenFrontend(envOrFrontend)];
}

function getBlueGreenFrontendPort(envOrFrontend = process.env) {
  return getBlueGreenFrontendConfig(envOrFrontend).port;
}

function getBlueGreenDirectServiceName(envOrFrontend = process.env) {
  return getBlueGreenFrontendConfig(envOrFrontend).servicePrefix;
}

function getBlueGreenAllWebServiceNames() {
  return Object.keys(BLUE_GREEN_FRONTENDS).flatMap((frontend) =>
    BLUE_GREEN_COLORS.map((color) => getBlueGreenServiceName(color, frontend))
  );
}

function getBlueGreenAllDirectWebServiceNames() {
  return Object.values(BLUE_GREEN_FRONTENDS).map(
    ({ servicePrefix }) => servicePrefix
  );
}

function isBlueGreenWebServiceName(serviceName) {
  return getBlueGreenAllWebServiceNames().includes(serviceName);
}

function isBlueGreenNativeWebServiceName(serviceName) {
  return BLUE_GREEN_COLORS.some(
    (color) => serviceName === getBlueGreenServiceName(color, 'next')
  );
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

  try {
    if (
      typeof fsImpl.statSync === 'function' &&
      !fsImpl.statSync(paths.proxyConfigFile).isFile()
    ) {
      return null;
    }
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) {
      return null;
    }

    throw error;
  }

  let config;
  try {
    config = fsImpl.readFileSync(paths.proxyConfigFile, 'utf8');
  } catch (error) {
    if (['EISDIR', 'ENOENT', 'ENOTDIR'].includes(error?.code)) {
      return null;
    }

    throw error;
  }
  const match = config.match(
    /^\s*server\s+(?:web|tanstack-web)-(blue|green):(?:7803|7824)\s+resolve\b(?!.*\bbackup\b).*$/imu
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

function normalizeBlueGreenTargetRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      activeColor: null,
      committedAt: null,
      commitHash: null,
      commitShortHash: null,
      deploymentStamp: null,
      frontend: DEFAULT_BLUE_GREEN_FRONTEND,
      health: 'unknown',
      lastPromotedAt: null,
      standbyColor: null,
    };
  }

  const activeColor = isBlueGreenColor(value.activeColor)
    ? value.activeColor
    : null;
  const standbyColor = isBlueGreenColor(value.standbyColor)
    ? value.standbyColor
    : null;

  return {
    activeColor,
    committedAt:
      typeof value.committedAt === 'string' ? value.committedAt : null,
    commitHash: typeof value.commitHash === 'string' ? value.commitHash : null,
    commitShortHash:
      typeof value.commitShortHash === 'string' ? value.commitShortHash : null,
    deploymentStamp:
      typeof value.deploymentStamp === 'string' ? value.deploymentStamp : null,
    frontend: (() => {
      try {
        return normalizeBlueGreenFrontend(value.frontend);
      } catch {
        return DEFAULT_BLUE_GREEN_FRONTEND;
      }
    })(),
    health: typeof value.health === 'string' ? value.health : 'unknown',
    lastPromotedAt:
      typeof value.lastPromotedAt === 'number' &&
      Number.isFinite(value.lastPromotedAt)
        ? value.lastPromotedAt
        : null,
    standbyColor,
  };
}

function readBlueGreenTargetState(paths = getBlueGreenPaths(), fsImpl = fs) {
  if (!fsImpl.existsSync(paths.targetStateFile)) {
    return {
      targets: {
        hive: normalizeBlueGreenTargetRuntime(null),
        web: normalizeBlueGreenTargetRuntime(null),
      },
      version: 1,
    };
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.targetStateFile, 'utf8')
    );
    const targets =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed.targets
        : null;

    return {
      targets: {
        hive: normalizeBlueGreenTargetRuntime(targets?.hive),
        web: normalizeBlueGreenTargetRuntime(targets?.web),
      },
      version: 1,
    };
  } catch {
    return {
      targets: {
        hive: normalizeBlueGreenTargetRuntime(null),
        web: normalizeBlueGreenTargetRuntime(null),
      },
      version: 1,
    };
  }
}

function writeBlueGreenTargetState(
  state,
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  ensureBlueGreenRuntime(paths, fsImpl);
  fsImpl.writeFileSync(
    paths.targetStateFile,
    JSON.stringify(
      {
        targets: {
          hive: normalizeBlueGreenTargetRuntime(state?.targets?.hive),
          web: normalizeBlueGreenTargetRuntime(state?.targets?.web),
        },
        updatedAt: new Date().toISOString(),
        version: 1,
      },
      null,
      2
    ),
    'utf8'
  );
}

function updateBlueGreenTargetRuntime(
  target,
  patch,
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (!['hive', 'web'].includes(target)) {
    throw new Error(`Unsupported blue/green target "${target}".`);
  }

  const state = readBlueGreenTargetState(paths, fsImpl);
  writeBlueGreenTargetState(
    {
      ...state,
      targets: {
        ...state.targets,
        [target]: {
          ...state.targets[target],
          ...patch,
        },
      },
    },
    paths,
    fsImpl
  );
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

function readBlueGreenSupportBuildHashes(
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (!fsImpl.existsSync(paths.buildHashesFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.buildHashesFile, 'utf8')
    );
    const services =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed.services && typeof parsed.services === 'object'
          ? parsed.services
          : parsed
        : null;

    if (!services || Array.isArray(services)) {
      return null;
    }

    return Object.fromEntries(
      Object.entries(services).filter(
        ([serviceName, hash]) =>
          typeof serviceName === 'string' &&
          typeof hash === 'string' &&
          hash.length > 0
      )
    );
  } catch {
    return null;
  }
}

function writeBlueGreenSupportBuildHashes(
  hashes,
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (!hashes || typeof hashes !== 'object' || Array.isArray(hashes)) {
    return;
  }

  ensureBlueGreenRuntime(paths, fsImpl);
  fsImpl.writeFileSync(
    paths.buildHashesFile,
    JSON.stringify(
      {
        services: hashes,
        updatedAt: new Date().toISOString(),
        version: BLUE_GREEN_BUILD_HASH_VERSION,
      },
      null,
      2
    ),
    'utf8'
  );
}

function readBlueGreenSupportBuildHashHistory(
  paths = getBlueGreenPaths(),
  fsImpl = fs
) {
  if (!fsImpl.existsSync(paths.buildHashHistoryFile)) {
    return [];
  }

  try {
    const parsed = JSON.parse(
      fsImpl.readFileSync(paths.buildHashHistoryFile, 'utf8')
    );

    return Array.isArray(parsed)
      ? parsed.filter(
          (entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
        )
      : [];
  } catch {
    return [];
  }
}

function appendBlueGreenSupportBuildHashHistoryEntry(
  entry,
  { fsImpl = fs, limit = 200, paths = getBlueGreenPaths() } = {}
) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return [];
  }

  const history = readBlueGreenSupportBuildHashHistory(paths, fsImpl);
  const nextHistory = [entry, ...history].slice(0, limit);
  ensureBlueGreenRuntime(paths, fsImpl);
  fsImpl.writeFileSync(
    paths.buildHashHistoryFile,
    JSON.stringify(nextHistory, null, 2),
    'utf8'
  );

  return nextHistory;
}

function writeBlueGreenSupportBuildCacheSnapshot({
  buildServices,
  commit = null,
  deploymentKind = 'promotion',
  deploymentStamp = null,
  hashes,
  paths = getBlueGreenPaths(),
  fsImpl = fs,
  targetColor,
}) {
  if (!hashes) {
    return;
  }

  const previousHashes = readBlueGreenSupportBuildHashes(paths, fsImpl) ?? {};
  const mergedHashes = {
    ...previousHashes,
    ...hashes,
  };

  writeBlueGreenSupportBuildHashes(mergedHashes, paths, fsImpl);
  appendBlueGreenSupportBuildHashHistoryEntry(
    {
      buildServices: Array.isArray(buildServices) ? buildServices : [],
      commitHash:
        typeof commit?.hash === 'string' && commit.hash.length > 0
          ? commit.hash
          : null,
      committedAt:
        typeof commit?.committedAt === 'string' && commit.committedAt.length > 0
          ? commit.committedAt
          : null,
      commitShortHash:
        typeof commit?.shortHash === 'string' && commit.shortHash.length > 0
          ? commit.shortHash
          : null,
      commitSubject:
        typeof commit?.subject === 'string' && commit.subject.length > 0
          ? commit.subject
          : null,
      deploymentKind,
      deploymentStamp,
      serviceHashes: mergedHashes,
      targetColor,
      updatedAt: new Date().toISOString(),
    },
    { fsImpl, paths }
  );
}

function generateBlueGreenDeploymentStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/u, 'Z')
    .replace(/[:.]/gu, '-');
}

function getPositiveIntegerEnv(env, name, fallback) {
  const parsed = Number.parseInt(String(env?.[name] ?? '').trim(), 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanEnvString(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

function normalizeBuildMetadataUrl(value) {
  const url = cleanEnvString(value);

  if (!url) {
    return null;
  }

  return /^https?:\/\//iu.test(url) ? url : `https://${url}`;
}

function setDefaultEnvValue(env, name, value) {
  if (cleanEnvString(env[name])) {
    return;
  }

  const cleanedValue = cleanEnvString(value);

  if (cleanedValue) {
    env[name] = cleanedValue;
  }
}

function resolveLatestCommitValue(commit, primaryKey, fallbackKey) {
  return (
    cleanEnvString(commit?.[primaryKey]) ??
    cleanEnvString(commit?.[fallbackKey])
  );
}

function createBlueGreenBuildMetadataEnv({
  baseEnv = {},
  builtAt = null,
  deploymentStamp,
  environment = 'production',
  latestCommit = null,
  refName = null,
} = {}) {
  const env = { ...baseEnv };
  const commitHash = resolveLatestCommitValue(
    latestCommit,
    'hash',
    'commitHash'
  );
  const commitShortHash = resolveLatestCommitValue(
    latestCommit,
    'shortHash',
    'commitShortHash'
  );
  const commitMessage = resolveLatestCommitValue(
    latestCommit,
    'subject',
    'commitSubject'
  );
  const sourceTimestamp =
    cleanEnvString(builtAt) ??
    resolveLatestCommitValue(latestCommit, 'committedAt', 'sourceTimestamp');
  const resolvedRefName =
    cleanEnvString(refName) ??
    cleanEnvString(latestCommit?.refName) ??
    cleanEnvString(env.GITHUB_REF_NAME) ??
    cleanEnvString(env.VERCEL_GIT_COMMIT_REF);
  const resolvedDeploymentUrl = normalizeBuildMetadataUrl(
    env.PLATFORM_BUILD_DEPLOYMENT_URL ??
      env.NEXT_PUBLIC_WEB_APP_URL ??
      env.NEXT_PUBLIC_APP_URL ??
      env.WEB_APP_URL
  );

  setDefaultEnvValue(env, 'PLATFORM_BUILD_BUILT_AT', sourceTimestamp);
  setDefaultEnvValue(env, 'PLATFORM_BUILD_COMMIT_HASH', commitHash);
  setDefaultEnvValue(env, 'PLATFORM_BUILD_COMMIT_SHORT_HASH', commitShortHash);
  setDefaultEnvValue(env, 'PLATFORM_BUILD_COMMIT_MESSAGE', commitMessage);
  setDefaultEnvValue(env, 'PLATFORM_BUILD_REF_NAME', resolvedRefName);
  setDefaultEnvValue(env, 'PLATFORM_BUILD_ENVIRONMENT', environment);
  setDefaultEnvValue(env, 'PLATFORM_BUILD_DEPLOYMENT_STAMP', deploymentStamp);
  setDefaultEnvValue(
    env,
    'PLATFORM_BUILD_DEPLOYMENT_URL',
    resolvedDeploymentUrl
  );

  return env;
}

function getPlatformBuildMetadataBuildArgs(env = {}) {
  return PLATFORM_BUILD_METADATA_ENV_NAMES.flatMap((name) => {
    const value = cleanEnvString(env[name]);

    return value ? ['--build-arg', `${name}=${value}`] : [];
  });
}

function getDeterministicBlueGreenBuildEnv(env = {}) {
  const runtimeOnlyNames = [
    'PLATFORM_BUILD_DEPLOYMENT_STAMP',
    'PLATFORM_BUILD_DEPLOYMENT_URL',
    'PLATFORM_DEPLOYMENT_STAMP',
  ];

  if (!runtimeOnlyNames.some((name) => Object.hasOwn(env, name))) {
    return env;
  }

  const buildEnv = { ...env };

  for (const name of runtimeOnlyNames) {
    delete buildEnv[name];
  }

  return buildEnv;
}

function createBlueGreenStage(id, target, overrides = {}) {
  return {
    buildServices: [],
    color: null,
    durationMs: null,
    failureReason: null,
    finishedAt: null,
    id,
    serviceNames: [],
    skippedReason: null,
    startedAt: null,
    status: 'queued',
    target,
    ...overrides,
  };
}

function createBlueGreenDeploymentStages({
  buildServices = [],
  env = {},
  targetColor,
}) {
  const webBuildService = buildServices.filter(
    (serviceName) => serviceName === getBlueGreenServiceName(targetColor, env)
  );
  const hiveBuildServices = buildServices.filter(
    (serviceName) =>
      serviceName.startsWith('hive-') || serviceName === 'hive-realtime'
  );
  const supportBuildServices = buildServices.filter(
    (serviceName) =>
      !isBlueGreenWebServiceName(serviceName) &&
      !serviceName.startsWith('hive-') &&
      serviceName !== 'hive-realtime'
  );

  return [
    createBlueGreenStage('web-build', 'web', {
      buildServices: webBuildService,
      color: targetColor,
      serviceNames: webBuildService,
    }),
    createBlueGreenStage('web-promote', 'web', {
      color: targetColor,
      serviceNames: webBuildService,
    }),
    createBlueGreenStage('hive-migrate', 'hive', {
      color: targetColor,
      serviceNames: [HIVE_DB_MIGRATE_SERVICE],
    }),
    createBlueGreenStage('hive-promote', 'hive', {
      buildServices: hiveBuildServices,
      color: targetColor,
      serviceNames: [getBlueGreenHiveServiceName(targetColor), 'hive-realtime'],
    }),
    createBlueGreenStage('support-refresh', 'support', {
      buildServices: supportBuildServices,
      serviceNames: [
        'meet-realtime',
        ...getBlueGreenHealthGateSupportServices(env),
      ].filter(
        (serviceName) =>
          supportBuildServices.length === 0 ||
          supportBuildServices.includes(serviceName)
      ),
    }),
    createBlueGreenStage('proxy-reload', 'proxy', {
      color: targetColor,
      serviceNames: [BLUE_GREEN_PROXY_SERVICE],
    }),
  ];
}

function updateBlueGreenDeploymentStage(stages, id, patch) {
  const index = stages.findIndex((stage) => stage.id === id);

  if (index === -1) {
    return stages;
  }

  const current = stages[index];
  const nextStartedAt =
    patch.status === 'running' && current.startedAt == null
      ? Date.now()
      : (patch.startedAt ?? current.startedAt);
  const nextFinishedAt =
    ['failed', 'skipped', 'succeeded'].includes(patch.status) &&
    patch.finishedAt == null
      ? Date.now()
      : (patch.finishedAt ?? current.finishedAt);

  stages[index] = {
    ...current,
    ...patch,
    durationMs:
      nextStartedAt != null && nextFinishedAt != null
        ? Math.max(0, nextFinishedAt - nextStartedAt)
        : (patch.durationMs ?? current.durationMs),
    finishedAt: nextFinishedAt,
    startedAt: nextStartedAt,
  };

  return stages;
}

function skipQueuedBlueGreenDeploymentStages(stages, reason) {
  for (const stage of stages) {
    if (stage.status === 'queued') {
      updateBlueGreenDeploymentStage(stages, stage.id, {
        skippedReason: reason,
        status: 'skipped',
      });
    }
  }

  return stages;
}

function attachBlueGreenDeploymentStages(error, stages) {
  if (error && typeof error === 'object') {
    error.blueGreenStages = stages;
  }

  return error;
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

function getBlueGreenServiceName(
  color,
  envOrFrontend = DEFAULT_BLUE_GREEN_FRONTEND
) {
  if (!isBlueGreenColor(color)) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  const { servicePrefix } = getBlueGreenFrontendConfig(envOrFrontend);
  return `${servicePrefix}-${color}`;
}

function getBlueGreenHiveServiceName(color) {
  if (!isBlueGreenColor(color)) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  return `hive-${color}`;
}

function getBlueGreenColorScopedSupportServices(color) {
  return [getBlueGreenHiveServiceName(color), 'hive-realtime', 'meet-realtime'];
}

function getBlueGreenPromotionHealthGateServices(color, env = {}) {
  return [
    getBlueGreenHiveServiceName(color),
    'hive-realtime',
    'meet-realtime',
    ...getBlueGreenHealthGateSupportServices(env),
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

  const { cacheLabel } = getBlueGreenFrontendConfig(env);

  return `${getComposeProjectName(composeFile, env)}-${cacheLabel}-cache:${commitShortHash.trim()}`;
}

async function assertBlueGreenCachedImageExists(
  cachedImageTag,
  { env, runCommand: run }
) {
  const imageTag =
    typeof cachedImageTag === 'string' ? cachedImageTag.trim() : '';

  if (!imageTag) {
    throw new Error('Cached recovery image tag is required.');
  }

  await runChecked('docker', ['image', 'inspect', imageTag], {
    env,
    runCommand: run,
    stdio: 'pipe',
  });

  return imageTag;
}

async function retagCachedImageForService(
  cachedImageTag,
  serviceName,
  { composeFile, env, runCommand: run }
) {
  const imageTag = await assertBlueGreenCachedImageExists(cachedImageTag, {
    env,
    runCommand: run,
  });
  const serviceImageName = getComposeServiceImageName(serviceName, {
    composeFile,
    env,
  });

  await runChecked('docker', ['tag', imageTag, serviceImageName], {
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
  {
    deploymentStamp = null,
    env = null,
    extraServerBlocks = [],
    frontend = null,
    hiveColor = null,
    hiveStandbyColor = null,
    standbyColor = null,
  } = {}
) {
  const webColor = color;
  const selectedFrontend = getBlueGreenFrontend(frontend ?? env ?? {});
  const selectedFrontendPort = getBlueGreenFrontendPort(selectedFrontend);
  const resolvedHiveColor = hiveColor ?? webColor;
  const resolvedHiveStandbyColor =
    hiveStandbyColor ?? (resolvedHiveColor === webColor ? standbyColor : null);

  if (!isBlueGreenColor(webColor)) {
    throw new Error(`Unsupported blue/green color "${webColor}".`);
  }

  if (!isBlueGreenColor(resolvedHiveColor)) {
    throw new Error(
      `Unsupported Hive blue/green color "${resolvedHiveColor}".`
    );
  }

  const primaryServiceName = getBlueGreenServiceName(
    webColor,
    selectedFrontend
  );
  const primaryHiveServiceName = getBlueGreenHiveServiceName(resolvedHiveColor);
  const backupServiceName =
    standbyColor && standbyColor !== webColor
      ? getBlueGreenServiceName(standbyColor, selectedFrontend)
      : null;
  const backupHiveServiceName =
    resolvedHiveStandbyColor && resolvedHiveStandbyColor !== resolvedHiveColor
      ? getBlueGreenHiveServiceName(resolvedHiveStandbyColor)
      : null;
  const projectServerBlocks = Array.isArray(extraServerBlocks)
    ? extraServerBlocks.filter(
        (block) => typeof block === 'string' && block.trim().length > 0
      )
    : [];
  const browserStateRecoveryHeaders = [
    '    add_header Cache-Control "no-store, no-cache, must-revalidate" always;',
    '    add_header CDN-Cache-Control "no-store" always;',
    `    add_header Clear-Site-Data ${JSON.stringify(BLUE_GREEN_CLEAR_SITE_DATA_VALUE)} always;`,
  ];
  const browserStateRecoveryLocation = [
    `  location = ${BLUE_GREEN_BROWSER_STATE_RECOVERY_PATH} {`,
    ...browserStateRecoveryHeaders,
    '    return 302 /login?browserStateReset=1;',
    '  }',
  ];
  const browserStateRecoveryErrorLocation = [
    '  location @browser_state_recovery {',
    ...browserStateRecoveryHeaders,
    '    return 302 /login?browserStateReset=1;',
    '  }',
  ];

  return [
    'map $http_upgrade $connection_upgrade {',
    '  default upgrade;',
    "  '' close;",
    '}',
    '',
    'map "$http_host|$http_x_forwarded_host" $platform_forwarded_host {',
    '  default $http_host;',
    '  "~^(?:127\\.0\\.0\\.1|localhost):7803\\|(?:[A-Za-z0-9-]+\\.)+localhost:1355$" $http_x_forwarded_host;',
    '}',
    '',
    'map "$http_host|$http_x_forwarded_host|$http_x_forwarded_proto" $platform_forwarded_proto {',
    '  default $scheme;',
    '  "~^(?:127\\.0\\.0\\.1|localhost):7803\\|(?:[A-Za-z0-9-]+\\.)+localhost:1355\\|https?$" $http_x_forwarded_proto;',
    '}',
    '',
    'resolver 127.0.0.11 ipv6=off valid=5s;',
    '',
    'log_format platform_blue_green_json escape=json',
    `  '{"time":"$time_iso8601","remoteAddr":"$remote_addr","host":"$host","method":"$request_method","path":"$request_uri","status":$status,"requestTime":$request_time,"upstreamResponseTime":"$upstream_response_time","upstreamAddr":"$upstream_addr","projectId":"$platform_project_id","selectedBranch":"$platform_selected_branch","upstreamService":"$platform_upstream_service","deploymentStamp":"$upstream_http_x_platform_deployment_stamp","deploymentColor":"$upstream_http_x_platform_blue_green_color","frontend":"${selectedFrontend}","primaryColor":"${webColor}","standbyColor":"${standbyColor ?? 'none'}","hivePrimaryColor":"${resolvedHiveColor}","hiveStandbyColor":"${resolvedHiveStandbyColor ?? 'none'}","userAgent":"$http_user_agent"}';`,
    'access_log /dev/stdout platform_blue_green_json;',
    'error_log /dev/stderr warn;',
    '',
    'upstream web_upstream {',
    '  zone web_upstream 64k;',
    `  server ${primaryServiceName}:${selectedFrontendPort} resolve max_fails=1 fail_timeout=5s;`,
    ...(backupServiceName
      ? [
          `  server ${backupServiceName}:${selectedFrontendPort} backup resolve max_fails=1 fail_timeout=5s;`,
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
    'upstream meet_realtime_upstream {',
    '  zone meet_realtime_upstream 64k;',
    '  server meet-realtime:7816 resolve max_fails=1 fail_timeout=5s;',
    '}',
    '',
    'server {',
    '  listen 7803;',
    '  set $platform_project_id "platform";',
    '  set $platform_selected_branch "production";',
    `  set $platform_upstream_service "${primaryServiceName}";`,
    `  client_header_buffer_size ${BLUE_GREEN_CLIENT_HEADER_BUFFER_SIZE};`,
    '  keepalive_timeout 15s;',
    `  large_client_header_buffers ${BLUE_GREEN_LARGE_CLIENT_HEADER_BUFFERS};`,
    '  error_page 431 494 = @browser_state_recovery;',
    `  add_header X-Platform-Deployment-Stamp "${deploymentStamp ?? 'unknown'}" always;`,
    `  add_header X-Platform-Blue-Green-Primary "${webColor}" always;`,
    `  add_header X-Platform-Blue-Green-Standby "${standbyColor ?? 'none'}" always;`,
    '',
    ...browserStateRecoveryErrorLocation,
    '',
    `  location = ${BLUE_GREEN_DRAIN_STATUS_PATH} {`,
    '    allow 127.0.0.1;',
    '    deny all;',
    '    proxy_connect_timeout 3s;',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://web_upstream;',
    '    proxy_set_header Host $http_host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Host $platform_forwarded_host;',
    '    proxy_set_header X-Forwarded-Proto $platform_forwarded_proto;',
    '    proxy_set_header X-Platform-Internal-Drain-Status "1";',
    '  }',
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
    '    proxy_set_header Host $http_host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Host $platform_forwarded_host;',
    '    proxy_set_header X-Forwarded-Proto $platform_forwarded_proto;',
    '    proxy_set_header X-Platform-Internal-Drain-Status "";',
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
    `  client_header_buffer_size ${BLUE_GREEN_CLIENT_HEADER_BUFFER_SIZE};`,
    '  keepalive_timeout 15s;',
    `  large_client_header_buffers ${BLUE_GREEN_LARGE_CLIENT_HEADER_BUFFERS};`,
    '  error_page 431 494 = @browser_state_recovery;',
    `  add_header X-Platform-Deployment-Stamp "${deploymentStamp ?? 'unknown'}" always;`,
    `  add_header X-Platform-Blue-Green-Primary "${resolvedHiveColor}" always;`,
    `  add_header X-Platform-Blue-Green-Standby "${resolvedHiveStandbyColor ?? 'none'}" always;`,
    '',
    ...browserStateRecoveryErrorLocation,
    '',
    ...browserStateRecoveryLocation,
    '',
    '  location /realtime {',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://hive_realtime_upstream;',
    '    proxy_set_header Host $http_host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Host $platform_forwarded_host;',
    '    proxy_set_header X-Forwarded-Proto $platform_forwarded_proto;',
    '    proxy_set_header X-Platform-Internal-Drain-Status "";',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
    '',
    '  location / {',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://hive_app_upstream;',
    '    proxy_set_header Host $http_host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Host $platform_forwarded_host;',
    '    proxy_set_header X-Forwarded-Proto $platform_forwarded_proto;',
    '    proxy_set_header X-Platform-Internal-Drain-Status "";',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
    '}',
    '',
    'server {',
    '  listen 7803;',
    '  listen 7816;',
    '  server_name tumeet.me meet.tuturuuu.com;',
    '  set $platform_project_id "meet";',
    '  set $platform_selected_branch "production";',
    '  set $platform_upstream_service "meet-realtime";',
    `  client_header_buffer_size ${BLUE_GREEN_CLIENT_HEADER_BUFFER_SIZE};`,
    '  keepalive_timeout 15s;',
    `  large_client_header_buffers ${BLUE_GREEN_LARGE_CLIENT_HEADER_BUFFERS};`,
    '  error_page 431 494 = @browser_state_recovery;',
    `  add_header X-Platform-Deployment-Stamp "${deploymentStamp ?? 'unknown'}" always;`,
    `  add_header X-Platform-Blue-Green-Primary "${webColor}" always;`,
    `  add_header X-Platform-Blue-Green-Standby "${standbyColor ?? 'none'}" always;`,
    '',
    ...browserStateRecoveryErrorLocation,
    '',
    '  location /realtime {',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://meet_realtime_upstream;',
    '    proxy_set_header Host $http_host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Host $platform_forwarded_host;',
    '    proxy_set_header X-Forwarded-Proto $platform_forwarded_proto;',
    '    proxy_set_header X-Platform-Internal-Drain-Status "";',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
    '',
    '  location /health {',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://meet_realtime_upstream/health;',
    '    proxy_set_header Host $http_host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Host $platform_forwarded_host;',
    '    proxy_set_header X-Forwarded-Proto $platform_forwarded_proto;',
    '    proxy_set_header X-Platform-Internal-Drain-Status "";',
    '  }',
    '',
    '  location / {',
    '    proxy_http_version 1.1;',
    '    proxy_pass http://web_upstream;',
    '    proxy_set_header Host $http_host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Host $platform_forwarded_host;',
    '    proxy_set_header X-Forwarded-Proto $platform_forwarded_proto;',
    '    proxy_set_header X-Platform-Internal-Drain-Status "";',
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
    env = null,
    extraServerBlocks = [],
    frontend = null,
    fsImpl = fs,
    hiveColor = null,
    hiveStandbyColor = null,
    paths = getBlueGreenPaths(),
    standbyColor = null,
  } = {}
) {
  ensureBlueGreenRuntime(paths, fsImpl);

  try {
    if (
      typeof fsImpl.statSync === 'function' &&
      typeof fsImpl.rmSync === 'function' &&
      fsImpl.existsSync(paths.proxyConfigFile) &&
      fsImpl.statSync(paths.proxyConfigFile).isDirectory()
    ) {
      fsImpl.rmSync(paths.proxyConfigFile, { force: true, recursive: true });
    }
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) {
      throw error;
    }
  }

  fsImpl.writeFileSync(
    paths.proxyConfigFile,
    renderBlueGreenProxyConfig(color, {
      deploymentStamp,
      env,
      extraServerBlocks,
      frontend,
      hiveColor,
      hiveStandbyColor,
      standbyColor,
    }),
    'utf8'
  );
}

function getBlueGreenProdServices(parsed, targetColor, env = {}) {
  return getBlueGreenProdServicesWithProxyOption(
    parsed,
    targetColor,
    true,
    env
  );
}

function getBlueGreenProdServicesWithProxyOption(
  parsed,
  targetColor,
  includeProxy = true,
  env = {}
) {
  const services = [
    getBlueGreenServiceName(targetColor, env),
    ...getBlueGreenColorScopedSupportServices(targetColor),
    ...getBlueGreenHealthGateSupportServices(env),
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

function normalizeChangedFilePath(filePath) {
  return String(filePath ?? '')
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//u, '');
}

function changedFilesIncludePath(changedFiles, watchedPath) {
  const normalizedWatchedPath = normalizeChangedFilePath(watchedPath);

  return changedFiles.some((filePath) => {
    const normalizedFilePath = normalizeChangedFilePath(filePath);

    if (normalizedWatchedPath.endsWith('/')) {
      return normalizedFilePath.startsWith(normalizedWatchedPath);
    }

    return normalizedFilePath === normalizedWatchedPath;
  });
}

function getBlueGreenSupportBuildServiceName(serviceName, targetColor) {
  return serviceName === 'hive'
    ? getBlueGreenHiveServiceName(targetColor)
    : serviceName;
}

function getBlueGreenAllSupportBuildServices(targetColor, env = {}) {
  return getBlueGreenSupportBuildServiceNames(env).map((serviceName) =>
    getBlueGreenSupportBuildServiceName(serviceName, targetColor)
  );
}

function getBlueGreenSupportBuildInputSpecs(targetColor, env = {}) {
  const specs = [
    {
      paths: [
        '.dockerignore',
        'docker-compose.web.prod.yml',
        'docker-compose/compose.web.prod.sidecars.yml',
        ...BLUE_GREEN_BACKEND_BUILD_PATHS,
      ],
      serviceName: 'backend',
    },
    {
      paths: [
        '.dockerignore',
        'bun.lock',
        'docker-compose.web.prod.yml',
        'docker-compose/compose.web.prod.sidecars.yml',
        'package.json',
        'turbo.json',
        ...BLUE_GREEN_HIVE_BUILD_PATHS,
      ],
      serviceName: getBlueGreenHiveServiceName(targetColor),
    },
    {
      paths: [
        '.dockerignore',
        'bun.lock',
        'docker-compose.web.prod.yml',
        'docker-compose/compose.web.prod.sidecars.yml',
        'package.json',
        'turbo.json',
        ...BLUE_GREEN_HIVE_REALTIME_BUILD_PATHS,
      ],
      serviceName: 'hive-realtime',
    },
    {
      paths: [
        '.dockerignore',
        'bun.lock',
        'docker-compose.web.prod.yml',
        'docker-compose/compose.web.prod.sidecars.yml',
        'package.json',
        'turbo.json',
        ...BLUE_GREEN_MEET_REALTIME_BUILD_PATHS,
      ],
      serviceName: 'meet-realtime',
    },
    {
      paths: [
        'docker-compose.web.prod.yml',
        'docker-compose/compose.web.prod.sidecars.yml',
        ...BLUE_GREEN_MARKITDOWN_BUILD_PATHS,
      ],
      serviceName: 'markitdown',
    },
    {
      paths: [
        'docker-compose.web.prod.yml',
        'docker-compose/compose.web.prod.sidecars.yml',
        ...BLUE_GREEN_STORAGE_UNZIP_PROXY_BUILD_PATHS,
      ],
      serviceName: 'storage-unzip-proxy',
    },
    {
      paths: [
        'docker-compose.web.prod.yml',
        'docker-compose/compose.web.prod.sidecars.yml',
        ...BLUE_GREEN_SUPERMEMORY_BUILD_PATHS,
      ],
      serviceName: 'supermemory',
    },
    {
      paths: [
        'docker-compose.web.prod.yml',
        ...BLUE_GREEN_WEB_DOCKER_CONTROL_BUILD_PATHS,
      ],
      serviceName: 'web-docker-control',
    },
    {
      paths: [
        'docker-compose.web.prod.yml',
        ...BLUE_GREEN_WEB_CRON_RUNNER_BUILD_PATHS,
      ],
      serviceName: 'web-cron-runner',
    },
  ];

  return specs.filter((spec) => {
    if (spec.serviceName === 'supermemory') {
      return isBlueGreenSupermemoryEnabled(env);
    }

    if (spec.serviceName === 'web-cron-runner') {
      return isBlueGreenCronRunnerEnabled(env);
    }

    return true;
  });
}

async function listBlueGreenBuildInputFiles({
  env,
  paths,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const result = await runChecked(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...paths,
    ],
    {
      cwd: rootDir,
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return result.stdout
    .split('\0')
    .map((filePath) => normalizeChangedFilePath(filePath))
    .filter(Boolean)
    .sort();
}

function hashBlueGreenBuildInputFiles(
  files,
  { fsImpl = fs, rootDir = ROOT_DIR }
) {
  const hash = crypto.createHash('sha256');

  for (const filePath of files) {
    const resolvedPath = path.join(rootDir, filePath);

    try {
      const stats = fsImpl.statSync(resolvedPath);

      if (!stats.isFile()) {
        continue;
      }

      hash.update(filePath);
      hash.update('\0');
      hash.update(String(stats.size));
      hash.update('\0');
      hash.update(fsImpl.readFileSync(resolvedPath));
      hash.update('\0');
    } catch {
      hash.update(filePath);
      hash.update('\0missing\0');
    }
  }

  return hash.digest('hex');
}

async function getBlueGreenSupportBuildInputHashes({
  env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  targetColor,
} = {}) {
  try {
    const hashes = {};

    for (const spec of getBlueGreenSupportBuildInputSpecs(targetColor, env)) {
      const inputFiles = await listBlueGreenBuildInputFiles({
        env,
        paths: spec.paths,
        rootDir,
        runCommand: run,
      });

      hashes[spec.serviceName] = hashBlueGreenBuildInputFiles(inputFiles, {
        fsImpl,
        rootDir,
      });
    }

    return hashes;
  } catch {
    return null;
  }
}

function getBlueGreenChangedSupportBuildServices(
  targetColor,
  changedFiles,
  env = {}
) {
  if (
    BLUE_GREEN_FORCE_SUPPORT_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    return getBlueGreenAllSupportBuildServices(targetColor, env);
  }

  const services = [];
  const addService = (serviceName) => {
    if (!services.includes(serviceName)) {
      services.push(serviceName);
    }
  };

  if (
    BLUE_GREEN_HIVE_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService(getBlueGreenHiveServiceName(targetColor));
  }

  if (
    BLUE_GREEN_HIVE_REALTIME_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('hive-realtime');
  }

  if (
    BLUE_GREEN_BACKEND_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('backend');
  }

  if (
    BLUE_GREEN_MEET_REALTIME_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('meet-realtime');
  }

  if (
    BLUE_GREEN_MARKITDOWN_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('markitdown');
  }

  if (
    BLUE_GREEN_STORAGE_UNZIP_PROXY_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('storage-unzip-proxy');
  }

  if (
    isBlueGreenSupermemoryEnabled(env) &&
    BLUE_GREEN_SUPERMEMORY_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('supermemory');
  }

  if (
    BLUE_GREEN_WEB_DOCKER_CONTROL_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('web-docker-control');
  }

  if (
    isBlueGreenCronRunnerEnabled(env) &&
    BLUE_GREEN_WEB_CRON_RUNNER_BUILD_PATHS.some((watchedPath) =>
      changedFilesIncludePath(changedFiles, watchedPath)
    )
  ) {
    addService('web-cron-runner');
  }

  return services;
}

function getBlueGreenDeploymentBuildServices({
  changedFiles = null,
  env = {},
  forceBuildSupportServices = false,
  previousSupportBuildHashes = null,
  supportBuildHashes = null,
  targetColor,
} = {}) {
  const services = [getBlueGreenServiceName(targetColor, env)];
  const hasPreviousSupportBuildHashes =
    previousSupportBuildHashes &&
    typeof previousSupportBuildHashes === 'object' &&
    Object.keys(previousSupportBuildHashes).length > 0;
  let supportServices;

  if (forceBuildSupportServices) {
    supportServices = getBlueGreenAllSupportBuildServices(targetColor, env);
  } else if (
    hasPreviousSupportBuildHashes &&
    supportBuildHashes &&
    typeof supportBuildHashes === 'object'
  ) {
    supportServices = getBlueGreenAllSupportBuildServices(
      targetColor,
      env
    ).filter(
      (serviceName) =>
        previousSupportBuildHashes?.[serviceName] !==
        supportBuildHashes[serviceName]
    );
  } else {
    supportServices = Array.isArray(changedFiles)
      ? getBlueGreenChangedSupportBuildServices(targetColor, changedFiles, env)
      : getBlueGreenAllSupportBuildServices(targetColor, env);
  }

  for (const serviceName of supportServices) {
    if (!services.includes(serviceName)) {
      services.push(serviceName);
    }
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

      return { containerPort, hostIp: BLUE_GREEN_PROXY_HOST_IP, hostPort };
    }
  );
}

function hasExpectedHostPortBinding(
  ports,
  { containerPort, hostIp, hostPort }
) {
  const bindings = ports?.[`${containerPort}/tcp`];

  return (
    Array.isArray(bindings) &&
    bindings.some(
      (binding) =>
        String(binding?.HostIp ?? '') === hostIp &&
        String(binding?.HostPort ?? '') === hostPort
    )
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

function normalizeDockerImageReference(image) {
  return typeof image === 'string' ? image.trim() : '';
}

async function getComposeServiceExpectedImage(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const result = await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'config',
      '--format',
      'json'
    ),
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );
  const config = JSON.parse(result.stdout.trim() || '{}');
  const image = config?.services?.[serviceName]?.image;

  return normalizeDockerImageReference(image) || null;
}

async function getComposeServiceRunningImage(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const containerId = await getComposeServiceContainerId(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  if (!containerId) {
    return null;
  }

  const result = await runChecked(
    'docker',
    ['inspect', '-f', '{{.Config.Image}}', containerId],
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return normalizeDockerImageReference(result.stdout) || null;
}

async function hasComposeServiceExpectedImage(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const expectedImage = await getComposeServiceExpectedImage(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  if (!expectedImage) {
    return true;
  }

  const runningImage = await getComposeServiceRunningImage(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  if (!runningImage) {
    return false;
  }

  return (
    normalizeDockerImageReference(runningImage) ===
    normalizeDockerImageReference(expectedImage)
  );
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

async function restartBuildkitBeforeBlueGreenBuild({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  if (String(env?.DOCKER_WEB_BUILDKIT_RESTART_BEFORE_BUILD ?? '') !== '1') {
    return;
  }

  const composeEnv = getResolvedBuildkitComposeEnv(env);

  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'restart',
      BUILDKIT_SERVICE_NAME
    ),
    {
      env: composeEnv,
      runCommand: run,
    }
  );
  await waitForComposeServiceHealthy(BUILDKIT_SERVICE_NAME, {
    composeFile,
    composeGlobalArgs,
    env: composeEnv,
    runCommand: run,
  });
}

async function buildBlueGreenServices({
  bakeFile = BLUE_GREEN_BAKE_FILE,
  buildStrategy = 'compose',
  composeFile,
  composeGlobalArgs = [],
  env,
  fsImpl = fs,
  osImpl = os,
  rootDir = ROOT_DIR,
  runCommand: run,
  services,
  sleep: sleepImpl = sleep,
}) {
  const timeoutMs = getBlueGreenBuildTimeoutMs(env);
  const buildServiceBatches = getBlueGreenBuildServiceBatches(services, env);
  const deterministicBuildEnv = getDeterministicBlueGreenBuildEnv(env);
  const useNativeWebBuild = isNativeWebBuildEnabled(env);
  let nativeWebArtifactsBuilt = false;

  const buildNativeWebServices = async (
    webServices,
    { buildEnv = env, noCache = false } = {}
  ) => {
    if (webServices.length === 0) {
      return;
    }

    if (!nativeWebArtifactsBuilt) {
      await buildNativeWebArtifacts({
        env: buildEnv,
        fsImpl,
        osImpl,
        rootDir,
        runCommand: run,
      });
      nativeWebArtifactsBuilt = true;
    }

    await buildNativeWebRuntimeImages({
      composeGlobalArgs,
      env: buildEnv,
      noCache,
      rootDir,
      runCommand: run,
      services: webServices,
    });
  };

  const runBuildBatches = async ({ buildEnv = env, noCache = false } = {}) => {
    for (const serviceBatch of buildServiceBatches) {
      const nativeWebServices = useNativeWebBuild
        ? serviceBatch.filter((serviceName) =>
            isBlueGreenNativeWebServiceName(serviceName)
          )
        : [];
      const dockerBuildServices = nativeWebServices.length
        ? serviceBatch.filter(
            (serviceName) => !nativeWebServices.includes(serviceName)
          )
        : serviceBatch;

      await buildNativeWebServices(nativeWebServices, { buildEnv, noCache });

      if (dockerBuildServices.length === 0) {
        continue;
      }

      if (useNativeWebBuild && !isNativeWebSupportBuildEnabled(buildEnv)) {
        continue;
      }

      const useBuildxBake =
        buildStrategy === 'bake' &&
        (!useNativeWebBuild || isNativeWebSupportBuildxEnabled(buildEnv));
      const args = useBuildxBake
        ? getBlueGreenBuildxBakeArgs({
            bakeFile,
            composeFile,
            env: buildEnv,
            noCache,
            serviceBatch: dockerBuildServices,
          })
        : getComposeCommandArgs(
            composeFile,
            composeGlobalArgs,
            'build',
            ...(noCache ? ['--no-cache'] : []),
            ...dockerBuildServices
          );
      const commandEnv =
        useNativeWebBuild && !useBuildxBake
          ? getNativeWebLocalDockerBuildEnv(buildEnv)
          : buildEnv;

      await runChecked('docker', args, {
        env: commandEnv,
        runCommand: run,
        stdio: 'pipe',
        teeOutput: true,
        timeoutMs,
      });
    }
  };

  const runBuildBatchesWithDockerRegistryBackoff = async ({
    buildEnv = env,
    noCache = false,
  } = {}) => {
    const maxAttempts = getPositiveIntegerEnv(
      env,
      'DOCKER_WEB_BUILD_RETRY_MAX_ATTEMPTS',
      DEFAULT_BLUE_GREEN_BUILD_RETRY_MAX_ATTEMPTS
    );
    const maxDelayMs = getPositiveIntegerEnv(
      env,
      'DOCKER_WEB_BUILD_RETRY_MAX_DELAY_MS',
      DEFAULT_BLUE_GREEN_BUILD_RETRY_MAX_DELAY_MS
    );
    let delayMs = getPositiveIntegerEnv(
      env,
      'DOCKER_WEB_BUILD_RETRY_INITIAL_DELAY_MS',
      DEFAULT_BLUE_GREEN_BUILD_RETRY_INITIAL_DELAY_MS
    );
    let attempt = 1;

    while (attempt <= maxAttempts) {
      try {
        return await runBuildBatches({ buildEnv, noCache });
      } catch (error) {
        if (attempt >= maxAttempts || !isTransientDockerRegistryError(error)) {
          throw error;
        }

        process.stderr.write(
          `Blue/green Docker build hit a transient Docker registry error; retrying in ${delayMs}ms (attempt ${
            attempt + 1
          }/${maxAttempts}).\n`
        );
        await sleepImpl(delayMs);
        attempt += 1;
        delayMs = Math.min(delayMs * 2, maxDelayMs);
      }
    }

    throw new Error('Unable to build blue/green services.');
  };

  const runBuildWithCacheRecovery = async ({
    buildEnv = env,
    noCache = false,
  } = {}) => {
    try {
      await runBuildBatchesWithDockerRegistryBackoff({ buildEnv, noCache });
      return;
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
        env: buildEnv,
        reason: recoveryReason,
        runCommand: run,
      });

      await runBuildBatchesWithDockerRegistryBackoff({
        buildEnv,
        noCache: true,
      });
    }
  };

  const runBuildWithAdaptiveResourceFallback = async () => {
    let buildEnv = deterministicBuildEnv;
    const attemptedProfileNames = new Set();

    const getResolvedBuildMemoryForLog = (attemptEnv) => {
      const rawMemory = attemptEnv.DOCKER_WEB_BUILD_MEMORY;

      if (
        String(rawMemory ?? '')
          .trim()
          .toLowerCase() === 'auto'
      ) {
        return getAutoBuildMemory(attemptEnv);
      }

      return rawMemory ?? 'unset';
    };

    const writeAdaptiveAttemptLog = (attemptEnv) => {
      if (!isAdaptiveBuildResourceProfileEnabled(attemptEnv)) {
        return;
      }

      const currentProfile = getBuildResourceProfileFromEnv(attemptEnv);
      const paths = getBuildResourceProfilePathsFromEnv(attemptEnv, rootDir);

      process.stderr.write(
        `BuildKit build attempt using profile ${currentProfile.name} (memory=${currentProfile.memory}, resolvedMemory=${getResolvedBuildMemoryForLog(attemptEnv)}, cpus=${attemptEnv.DOCKER_WEB_BUILD_CPUS ?? 'unset'}, maxParallelism=${attemptEnv.DOCKER_WEB_BUILD_MAX_PARALLELISM ?? 'unset'}, dockerMemoryLimit=${attemptEnv.DOCKER_WEB_DOCKER_MEMORY_LIMIT ?? 'unknown'}, dockerContext=${attemptEnv.DOCKER_CONTEXT ?? 'current'}, stateFile=${paths.stateFile}).\n`
      );
    };

    const persistRecommendedProfileAfterFailure = ({
      currentProfile,
      reason,
      stateFile,
    }) => {
      const recommendedProfile = getRecommendedBuildResourceProfile(buildEnv);

      if (
        !recommendedProfile ||
        recommendedProfile.name === currentProfile.name
      ) {
        return;
      }

      persistBuildResourceProfile({
        fsImpl,
        previousProfileName: currentProfile.name,
        profile: recommendedProfile,
        reason,
        stateFile,
      });
    };

    while (true) {
      const currentProfile = getBuildResourceProfileFromEnv(buildEnv);
      writeAdaptiveAttemptLog(buildEnv);

      try {
        await runBuildWithCacheRecovery({ buildEnv });
        return;
      } catch (error) {
        if (
          !isAdaptiveBuildResourceProfileEnabled(buildEnv) ||
          !isBuildkitResourceProfileFallbackError(error)
        ) {
          throw error;
        }

        attemptedProfileNames.add(currentProfile.name);

        const paths = getBuildResourceProfilePathsFromEnv(buildEnv, rootDir);
        const nextProfile = getNextAdaptiveBuildResourceProfile({
          attemptedProfileNames,
          currentProfileName: currentProfile.name,
          env: buildEnv,
          preferHardLimitProfile: isBuildkitMemoryExhaustionError(error),
        });

        if (!nextProfile) {
          persistRecommendedProfileAfterFailure({
            currentProfile,
            reason:
              currentProfile.name === 'floor'
                ? 'buildkit-resource-floor-failed'
                : 'buildkit-resource-fallback-exhausted',
            stateFile: paths.stateFile,
          });
          throw error;
        }

        const fallbackReason = 'buildkit-resource-fallback';

        persistBuildResourceProfile({
          fsImpl,
          previousProfileName: currentProfile.name,
          profile: nextProfile,
          reason: fallbackReason,
          stateFile: paths.stateFile,
        });

        const retryEnv = {
          ...applyBuildResourceProfileToEnv(buildEnv, nextProfile),
          [BUILD_RESOURCE_PROFILE_REASON_ENV]: fallbackReason,
        };

        process.stderr.write(
          `BuildKit transport/resource failure detected for build profile ${currentProfile.name}; ${nextProfile.name === 'default' ? 'resetting to budget-derived' : 'retrying with'} build profile ${nextProfile.name} (memory=${nextProfile.memory}, resolvedMemory=${getResolvedBuildMemoryForLog(retryEnv)}, cpus=${nextProfile.cpus}, maxParallelism=${nextProfile.maxParallelism}).\n`
        );

        await recoverBuildkitBunInstallCache({
          composeFile,
          composeGlobalArgs,
          env: retryEnv,
          reason: fallbackReason,
          runCommand: run,
        });

        buildEnv = await ensureBuildkitBuilder(
          {
            builderName:
              retryEnv.DOCKER_WEB_BUILD_BUILDER_NAME || retryEnv.BUILDX_BUILDER,
            cpus: retryEnv.DOCKER_WEB_BUILD_CPUS,
            maxParallelism: retryEnv.DOCKER_WEB_BUILD_MAX_PARALLELISM,
            memory: retryEnv.DOCKER_WEB_BUILD_MEMORY,
          },
          {
            composeFile,
            composeGlobalArgs,
            env: retryEnv,
            fsImpl,
            rootDir,
            runCommand: run,
          }
        );
      }
    }
  };

  await restartBuildkitBeforeBlueGreenBuild({
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  await runBuildWithAdaptiveResourceFallback();
}

async function runHiveDbForwardMigrations({
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
      'run',
      '--rm',
      HIVE_DB_MIGRATE_SERVICE
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function removeDbMigrateContainersIfPresent({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  await removeComposeServiceContainersByLabelIfPresent(DB_MIGRATE_SERVICES, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });
}

async function runHiveDbForwardMigrationsAndCleanup({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run,
}) {
  try {
    await runHiveDbForwardMigrations({
      composeFile,
      composeGlobalArgs,
      env,
      runCommand: run,
    });
  } catch (error) {
    try {
      await removeDbMigrateContainersIfPresent({
        composeFile,
        composeGlobalArgs,
        env,
        runCommand: run,
      });
    } catch {
      // Preserve the migration failure; cleanup errors are secondary here.
    }
    throw error;
  }

  await removeDbMigrateContainersIfPresent({
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });
}

async function pruneBlueGreenBuildkitCacheAfterWorkflow({
  composeFile,
  composeGlobalArgs = [],
  env,
  fsImpl = fs,
  runCommand: run,
}) {
  if (!env?.BUILDX_BUILDER && !env?.DOCKER_WEB_BUILD_BUILDER_NAME) {
    return;
  }

  try {
    await cleanupBuildkitAfterBuild({
      composeFile,
      composeGlobalArgs,
      env: {
        ...env,
        DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD:
          env.DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD ?? '0',
        DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD:
          env.DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD ?? '1',
      },
      fsImpl,
      runCommand: run,
    });
  } catch (cleanupError) {
    const message =
      cleanupError instanceof Error
        ? cleanupError.message
        : String(cleanupError);
    process.stderr.write(
      `[docker-web] Warning: failed to clean up BuildKit after deployment: ${message}\n`
    );
  }
}

function getBlueGreenBuildServiceBatches(services, env) {
  const composeParallelLimit = Number.parseInt(
    String(env?.COMPOSE_PARALLEL_LIMIT ?? '').trim(),
    10
  );

  if (
    Number.isFinite(composeParallelLimit) &&
    composeParallelLimit <= 1 &&
    services.length > 1
  ) {
    return services.map((service) => [service]);
  }

  return [services];
}

function isTruthyEnvValue(value) {
  return /^(1|true|yes|on)$/iu.test(String(value ?? '').trim());
}

function isNativeWebBuildEnabled(env = {}) {
  return isTruthyEnvValue(env.DOCKER_WEB_NATIVE_BUILD);
}

function isNativeWebRunnerBuildxEnabled(env = {}) {
  return isTruthyEnvValue(env.DOCKER_WEB_NATIVE_RUNNER_BUILDX);
}

function getNativeWebLocalDockerBuildEnv(env = {}) {
  const buildEnv = { ...env };

  delete buildEnv.BUILDX_BUILDER;
  delete buildEnv.BUILDKIT_HOST;
  delete buildEnv.DOCKER_WEB_BUILD_BUILDER_NAME;

  return buildEnv;
}

function getNativeWebRunnerDockerBuildEnv(env = {}) {
  if (isNativeWebRunnerBuildxEnabled(env)) {
    return env;
  }

  return getNativeWebLocalDockerBuildEnv(env);
}

function isNativeWebSupportBuildxEnabled(env = {}) {
  return isTruthyEnvValue(env.DOCKER_WEB_NATIVE_SUPPORT_BUILDX);
}

function isNativeWebSupportBuildEnabled(env = {}) {
  return (
    isTruthyEnvValue(env.DOCKER_WEB_NATIVE_SUPPORT_BUILD) ||
    isNativeWebSupportBuildxEnabled(env)
  );
}

function getHostTotalMemoryBuildValue(osImpl = os) {
  const totalMemoryBytes = osImpl.totalmem?.();

  if (!Number.isFinite(totalMemoryBytes) || totalMemoryBytes <= 0) {
    return null;
  }

  const totalMemoryGb = Math.floor(totalMemoryBytes / 1024 / 1024 / 1024);

  return totalMemoryGb > 0 ? `${totalMemoryGb}g` : null;
}

function getNativeWebBuildMemory(env = {}, osImpl = os) {
  return (
    env.DOCKER_WEB_NATIVE_BUILD_MEMORY ??
    env.DOCKER_WEB_BUILD_MEMORY ??
    getHostTotalMemoryBuildValue(osImpl) ??
    '12g'
  );
}

function isBlueGreenWebBuildSkipped(env = {}) {
  return isTruthyEnvValue(env.DOCKER_WEB_SKIP_BLUE_GREEN_WEB_BUILD);
}

function isBlueGreenSupportBuildSkipped(env = {}) {
  return isTruthyEnvValue(env.DOCKER_WEB_SKIP_BLUE_GREEN_SUPPORT_BUILD);
}

function getComposeProjectNameFromGlobalArgs(composeGlobalArgs = []) {
  for (let index = 0; index < composeGlobalArgs.length; index += 1) {
    const arg = composeGlobalArgs[index];

    if (arg === '-p' || arg === '--project-name') {
      const value = composeGlobalArgs[index + 1];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    if (typeof arg === 'string' && arg.startsWith('--project-name=')) {
      const value = arg.slice('--project-name='.length).trim();

      if (value.length > 0) {
        return value;
      }
    }
  }

  return null;
}

function getBlueGreenWebServiceImageTag(serviceName, envOrOptions = {}) {
  const env =
    typeof envOrOptions.env === 'object' && envOrOptions.env !== null
      ? envOrOptions.env
      : envOrOptions;
  const composeGlobalArgs = Array.isArray(envOrOptions.composeGlobalArgs)
    ? envOrOptions.composeGlobalArgs
    : [];
  const projectName =
    getComposeProjectNameFromGlobalArgs(composeGlobalArgs) ||
    env.COMPOSE_PROJECT_NAME ||
    getDockerWebComposeProjectName({ baseEnv: env });

  return `${projectName}-${serviceName}`;
}

function getNativeWebRunnerDockerfile(rootDir = ROOT_DIR) {
  return path.join(
    rootDir,
    'apps',
    'web',
    'docker',
    'native-runner.Dockerfile'
  );
}

function resolveNativeWebBuildEnvFile(env = {}, rootDir = ROOT_DIR) {
  const envFilePath =
    env.DOCKER_WEB_NATIVE_BUILD_ENV_FILE || env.DOCKER_WEB_ENV_FILE;

  if (!envFilePath) {
    return null;
  }

  return path.isAbsolute(envFilePath)
    ? envFilePath
    : path.join(rootDir, envFilePath);
}

function readOptionalNativeWebBuildSecret(filePath, fsImpl = fs) {
  if (!filePath) return null;

  try {
    return fsImpl.readFileSync(filePath, 'utf8').trim() || null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function getNativeWebTurboRemoteCacheEnv(env = {}, fsImpl = fs) {
  const team = readOptionalNativeWebBuildSecret(
    env.DOCKER_WEB_TURBO_TEAM_SECRET_FILE,
    fsImpl
  );
  const token = readOptionalNativeWebBuildSecret(
    env.DOCKER_WEB_TURBO_TOKEN_SECRET_FILE,
    fsImpl
  );

  return team && token ? { TURBO_TEAM: team, TURBO_TOKEN: token } : {};
}

async function buildNativeWebArtifacts({
  env = {},
  fsImpl = fs,
  osImpl = os,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
}) {
  const envFilePath = resolveNativeWebBuildEnvFile(env, rootDir);
  const args = [
    'run',
    ...(envFilePath ? ['--env-file', envFilePath] : []),
    'build:web:docker',
  ];

  await runChecked('bun', args, {
    cwd: rootDir,
    env: {
      ...env,
      ...getNativeWebTurboRemoteCacheEnv(env, fsImpl),
      CI: env.CI ?? '1',
      DOCKER_WEB_BUILD_MEMORY: getNativeWebBuildMemory(env, osImpl),
      DOCKER_WEB_DOCKER_MEMORY_LIMIT: env.DOCKER_WEB_NATIVE_BUILD_MEMORY ?? '',
      DOCKER_WEB_NATIVE_BUILD: '1',
      DOCKER_WEB_STANDALONE: '1',
      NEXT_TELEMETRY_DISABLED: env.NEXT_TELEMETRY_DISABLED ?? '1',
      NODE_ENV: 'production',
    },
    runCommand: run,
    timeoutMs: getBlueGreenBuildTimeoutMs(env),
  });
}

async function buildNativeWebRuntimeImages({
  composeGlobalArgs = [],
  env = {},
  imageTagResolver = getBlueGreenWebServiceImageTag,
  labels = [],
  metadataFileResolver,
  noCache = false,
  output = 'load',
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  services,
}) {
  if (!['load', 'registry'].includes(output)) {
    throw new Error(`Unsupported native web image output: ${output}`);
  }
  if (output === 'registry' && !isNativeWebRunnerBuildxEnabled(env)) {
    throw new Error('Registry output requires the native Buildx runner.');
  }

  const commandEnv = getNativeWebRunnerDockerBuildEnv(env);

  for (const serviceName of services) {
    const builderName = env.BUILDX_BUILDER || env.DOCKER_WEB_BUILD_BUILDER_NAME;
    const metadataFile = metadataFileResolver?.(serviceName);
    const buildArgs = [
      ...(noCache ? ['--no-cache'] : []),
      ...getPlatformBuildMetadataBuildArgs(env),
      ...labels.flatMap((label) => ['--label', label]),
      '--file',
      getNativeWebRunnerDockerfile(rootDir),
      '--tag',
      imageTagResolver(serviceName, { composeGlobalArgs, env }),
      rootDir,
    ];
    const args = isNativeWebRunnerBuildxEnabled(env)
      ? [
          'buildx',
          'build',
          ...(builderName ? ['--builder', builderName] : []),
          ...(output === 'registry'
            ? ['--output', 'type=registry']
            : ['--load']),
          ...(metadataFile ? ['--metadata-file', metadataFile] : []),
          ...buildArgs,
        ]
      : ['build', ...buildArgs];

    await runChecked('docker', args, {
      env: commandEnv,
      runCommand: run,
      timeoutMs: getBlueGreenBuildTimeoutMs(env),
    });
  }
}

function getBlueGreenBakeFile(rootDir = ROOT_DIR) {
  return path.join(rootDir, 'docker-bake.web.prod.hcl');
}

function getBlueGreenBuildxBakeArgs({
  bakeFile = BLUE_GREEN_BAKE_FILE,
  composeFile,
  env = {},
  noCache = false,
  serviceBatch,
}) {
  const args = [
    'buildx',
    'bake',
    ...(env.BUILDX_BUILDER || env.DOCKER_WEB_BUILD_BUILDER_NAME
      ? ['--builder', env.BUILDX_BUILDER || env.DOCKER_WEB_BUILD_BUILDER_NAME]
      : []),
    '-f',
    composeFile,
    '-f',
    bakeFile,
    ...(noCache ? ['--no-cache'] : []),
    ...serviceBatch,
  ];

  return args;
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
  const composeEnv = getBlueGreenProductionComposeEnvironment({
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

  const targetState = readBlueGreenTargetState(paths, fsImpl);
  const standbyColor = await resolveBlueGreenStandbyColor(activeColor, {
    composeFile,
    composeGlobalArgs: [],
    env: composeEnv,
    runCommand: run,
  });
  const hiveColor = targetState.targets.hive.activeColor ?? activeColor;
  const hiveStandbyColor =
    targetState.targets.hive.standbyColor ??
    (hiveColor !== activeColor ? activeColor : null);

  writeBlueGreenProxyConfig(activeColor, {
    deploymentStamp: readBlueGreenDeploymentStamp(paths, fsImpl),
    env: composeEnv,
    fsImpl,
    hiveColor,
    hiveStandbyColor,
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
  routeCheckAttempts,
  routeCheckDelayMs,
  runCommand: run,
}) {
  await testBlueGreenProxyRoute({
    composeFile,
    composeGlobalArgs,
    env,
    routeCheckAttempts,
    routeCheckDelayMs,
    runCommand: run,
    url: `http://127.0.0.1:7803${BLUE_GREEN_DRAIN_STATUS_PATH}`,
  });
}

async function testBlueGreenHiveProxyRouting({
  composeFile,
  composeGlobalArgs = [],
  env,
  routeCheckAttempts,
  routeCheckDelayMs,
  runCommand: run,
}) {
  await testBlueGreenProxyRoute({
    composeFile,
    composeGlobalArgs,
    env,
    routeCheckAttempts,
    routeCheckDelayMs,
    runCommand: run,
    url: 'http://127.0.0.1:7814/login',
  });
}

async function testBlueGreenProxyRoute({
  composeFile,
  composeGlobalArgs = [],
  env,
  routeCheckAttempts = BLUE_GREEN_PROXY_ROUTE_CHECK_ATTEMPTS,
  routeCheckDelayMs = BLUE_GREEN_PROXY_ROUTE_CHECK_DELAY_MS,
  runCommand: run,
  url,
}) {
  const args = getComposeCommandArgs(
    composeFile,
    composeGlobalArgs,
    'exec',
    '-T',
    BLUE_GREEN_PROXY_SERVICE,
    'wget',
    '-q',
    '-O',
    '/dev/null',
    url
  );
  let lastError = null;

  for (let attempt = 1; attempt <= routeCheckAttempts; attempt += 1) {
    try {
      await runChecked('docker', args, {
        env,
        runCommand: run,
      });
      return;
    } catch (error) {
      lastError = error;

      if (attempt < routeCheckAttempts) {
        await sleep(routeCheckDelayMs);
      }
    }
  }

  throw lastError;
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
      await isComposeServiceHealthy(getBlueGreenServiceName(color, env), {
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

  return (await isComposeServiceHealthy(
    getBlueGreenServiceName(standbyColor, env),
    {
      composeFile,
      composeGlobalArgs,
      env,
      runCommand: run,
    }
  ))
    ? standbyColor
    : null;
}

function getBlueGreenDeploymentServiceGroups(parsed, targetColor, env = {}) {
  const webServices = [getBlueGreenServiceName(targetColor, env)];
  const hiveServices = [
    getBlueGreenHiveServiceName(targetColor),
    'hive-realtime',
  ];
  const supportServices = [
    'meet-realtime',
    ...getBlueGreenHealthGateSupportServices(env),
  ];

  if (hasComposeProfile(parsed.composeGlobalArgs, 'redis')) {
    webServices.push('redis', 'serverless-redis-http');
  }

  return {
    hiveServices,
    supportServices,
    webServices,
  };
}

function splitBlueGreenDeploymentBuildServiceGroups(buildServices) {
  const webBuildServices = buildServices.filter((serviceName) =>
    isBlueGreenWebServiceName(serviceName)
  );
  const hiveBuildServices = buildServices.filter(
    (serviceName) =>
      serviceName.startsWith('hive-') || serviceName === 'hive-realtime'
  );
  const supportBuildServices = buildServices.filter(
    (serviceName) =>
      !isBlueGreenWebServiceName(serviceName) &&
      !serviceName.startsWith('hive-') &&
      serviceName !== 'hive-realtime'
  );

  return {
    hiveBuildServices,
    supportBuildServices,
    webBuildServices,
  };
}

async function runBlueGreenStage(stages, id, action) {
  updateBlueGreenDeploymentStage(stages, id, { status: 'running' });

  try {
    const result = await action();
    updateBlueGreenDeploymentStage(stages, id, { status: 'succeeded' });
    return result;
  } catch (error) {
    updateBlueGreenDeploymentStage(stages, id, {
      failureReason: error instanceof Error ? error.message : String(error),
      status: 'failed',
    });
    throw attachBlueGreenDeploymentStages(error, stages);
  }
}

function markBlueGreenStageSkipped(stages, id, reason) {
  updateBlueGreenDeploymentStage(stages, id, {
    skippedReason: reason,
    status: 'skipped',
  });
}

async function runBlueGreenProdWorkflow(parsed, options = {}) {
  const composeFile = getComposeFile(parsed.mode);
  const baseEnv = getBlueGreenProductionComposeEnvironment({
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
  const selectedFrontend = getBlueGreenFrontend(env);
  const selectedDirectServiceName =
    getBlueGreenDirectServiceName(selectedFrontend);
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
  const previousTargetState = readBlueGreenTargetState(paths, fsImpl);
  const latestCommitHash =
    typeof options.latestCommit?.hash === 'string' &&
    options.latestCommit.hash.length > 0
      ? options.latestCommit.hash
      : null;
  const webAlreadyPromoted =
    latestCommitHash != null &&
    previousTargetState.targets.web.commitHash === latestCommitHash &&
    isBlueGreenColor(previousTargetState.targets.web.activeColor) &&
    previousTargetState.targets.web.frontend === selectedFrontend &&
    previousTargetState.targets.web.health === 'healthy';
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
  const proxyHasExpectedImage =
    proxyRunning &&
    proxyHasRequiredHostPorts &&
    (await hasComposeServiceExpectedImage(BLUE_GREEN_PROXY_SERVICE, {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }));
  const needsProxyImageRefresh =
    proxyRunning && proxyHasRequiredHostPorts && !proxyHasExpectedImage;
  const needsProxyRefresh = needsProxyHostPortRefresh || needsProxyImageRefresh;
  const targetColor = webAlreadyPromoted
    ? previousTargetState.targets.web.activeColor
    : getNextBlueGreenColor(activeColor);
  const initialProxyColor = activeColor ?? targetColor;
  const standbyColor =
    targetColor === activeColor
      ? (previousTargetState.targets.web.standbyColor ??
        getNextBlueGreenColor(targetColor))
      : activeColor;
  const targetEnv = createBlueGreenBuildMetadataEnv({
    baseEnv: {
      ...env,
      DOCKER_WEB_FRONTEND: selectedFrontend,
      PLATFORM_BLUE_GREEN_COLOR: targetColor,
      PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
    },
    deploymentStamp,
    latestCommit: options.latestCommit,
  });
  const skipWebBuild = isBlueGreenWebBuildSkipped(targetEnv);
  const skipSupportBuild = isBlueGreenSupportBuildSkipped(targetEnv);
  const bakeFile =
    options.bakeFile ?? getBlueGreenBakeFile(options.rootDir ?? ROOT_DIR);
  const buildStrategy = options.buildStrategy ?? 'compose';
  const needsProxyBootstrap = !!migration || !proxyRunning || needsProxyRefresh;
  const previousHiveColor =
    previousTargetState.targets.hive.activeColor ?? activeColor ?? targetColor;
  const previousHiveStandbyColor =
    previousTargetState.targets.hive.standbyColor ??
    (previousHiveColor !== targetColor ? targetColor : null);
  let stages = createBlueGreenDeploymentStages({
    buildServices: [],
    env: targetEnv,
    targetColor,
  });
  let publicProxyPromoted = false;
  let testHiveProxyRoutingAfterBootstrap = false;

  try {
    if (needsProxyBootstrap) {
      writeBlueGreenProxyConfig(initialProxyColor, {
        deploymentStamp:
          readBlueGreenDeploymentStamp(paths, fsImpl) ?? deploymentStamp,
        env: targetEnv,
        fsImpl,
        hiveColor:
          previousTargetState.targets.hive.activeColor ?? initialProxyColor,
        hiveStandbyColor: previousTargetState.targets.hive.standbyColor,
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

    const previousSupportBuildHashes = readBlueGreenSupportBuildHashes(
      paths,
      fsImpl
    );
    const supportBuildHashes = await getBlueGreenSupportBuildInputHashes({
      env: targetEnv,
      fsImpl,
      rootDir: options.rootDir ?? ROOT_DIR,
      runCommand: run,
      targetColor,
    });
    const requestedBuildServices = getBlueGreenDeploymentBuildServices({
      changedFiles: options.changedFiles,
      env: targetEnv,
      forceBuildSupportServices: !activeColor || !!migration,
      previousSupportBuildHashes,
      supportBuildHashes,
      targetColor,
    });
    const buildServices = webAlreadyPromoted
      ? requestedBuildServices.filter(
          (serviceName) =>
            serviceName !== getBlueGreenServiceName(targetColor, targetEnv)
        )
      : requestedBuildServices;
    stages = createBlueGreenDeploymentStages({
      buildServices,
      env: targetEnv,
      targetColor,
    });
    const { hiveBuildServices, supportBuildServices, webBuildServices } =
      splitBlueGreenDeploymentBuildServiceGroups(buildServices);
    const { hiveServices, supportServices, webServices } =
      getBlueGreenDeploymentServiceGroups(parsed, targetColor, targetEnv);
    const proxyBootstrapServices = needsProxyBootstrap
      ? [
          BLUE_GREEN_PROXY_SERVICE,
          ...(hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared')
            ? [CLOUDFLARED_SERVICE]
            : []),
        ]
      : [];
    if (webAlreadyPromoted) {
      markBlueGreenStageSkipped(
        stages,
        'web-build',
        'web already promoted for current commit'
      );
      markBlueGreenStageSkipped(
        stages,
        'web-promote',
        'web already serving current commit'
      );
    } else {
      if (skipWebBuild) {
        markBlueGreenStageSkipped(
          stages,
          'web-build',
          'reusing prebuilt web image'
        );
      } else {
        await runBlueGreenStage(stages, 'web-build', async () => {
          await buildBlueGreenServices({
            bakeFile,
            buildStrategy,
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env: targetEnv,
            fsImpl,
            rootDir: options.rootDir ?? ROOT_DIR,
            runCommand: run,
            services: webBuildServices,
          });
        });
      }

      await runBlueGreenStage(stages, 'web-promote', async () => {
        await stopComposeServicesIfPresent([selectedDirectServiceName], {
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env,
          runCommand: run,
        });

        await stopComposeServicesIfPresent(
          [getBlueGreenServiceName(targetColor, targetEnv)],
          {
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env,
            runCommand: run,
          }
        );
        await removeComposeServicesIfPresent(
          [getBlueGreenServiceName(targetColor, targetEnv)],
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
          services: webServices,
          upArgs: [
            'up',
            '--detach',
            '--no-build',
            '--remove-orphans',
            ...parsed.composeArgs,
            ...webServices,
          ],
        });

        await waitForComposeServiceHealthy(
          getBlueGreenServiceName(targetColor, targetEnv),
          {
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env: targetEnv,
            runCommand: run,
          }
        );

        updateBlueGreenTargetRuntime(
          'web',
          {
            activeColor: targetColor,
            committedAt: options.latestCommit?.committedAt ?? null,
            commitHash: options.latestCommit?.hash ?? null,
            commitShortHash: options.latestCommit?.shortHash ?? null,
            deploymentStamp,
            frontend: selectedFrontend,
            health: 'staged',
            lastPromotedAt: null,
            standbyColor,
          },
          paths,
          fsImpl
        );
      });
    }

    await removeLegacyHiveContainerIfPresent({
      composeFile,
      env,
      runCommand: run,
    });
    await removeDbMigrateContainersIfPresent({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: targetEnv,
      runCommand: run,
    });

    if (hiveBuildServices.length > 0) {
      if (!skipSupportBuild) {
        await buildBlueGreenServices({
          bakeFile,
          buildStrategy,
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          fsImpl,
          rootDir: options.rootDir ?? ROOT_DIR,
          runCommand: run,
          services: hiveBuildServices,
        });
      }

      await runBlueGreenStage(stages, 'hive-migrate', async () => {
        await runHiveDbForwardMigrationsAndCleanup({
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          runCommand: run,
        });
      });

      await runBlueGreenStage(stages, 'hive-promote', async () => {
        await stopComposeServicesIfPresent(
          [getBlueGreenHiveServiceName(targetColor), 'hive-realtime'],
          {
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env,
            runCommand: run,
          }
        );
        await removeComposeServicesIfPresent(
          [getBlueGreenHiveServiceName(targetColor), 'hive-realtime'],
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
          services: hiveServices,
          upArgs: [
            'up',
            '--detach',
            '--no-build',
            '--remove-orphans',
            ...parsed.composeArgs,
            ...hiveServices,
          ],
        });
        await removeDbMigrateContainersIfPresent({
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          runCommand: run,
        });

        for (const serviceName of hiveServices) {
          await waitForComposeServiceHealthy(serviceName, {
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env: targetEnv,
            runCommand: run,
          });
        }

        writeBlueGreenProxyConfig(targetColor, {
          deploymentStamp,
          env: targetEnv,
          fsImpl,
          hiveColor: targetColor,
          hiveStandbyColor:
            previousHiveColor !== targetColor ? previousHiveColor : null,
          paths,
          standbyColor,
        });
        if (needsProxyBootstrap) {
          testHiveProxyRoutingAfterBootstrap = true;
        } else {
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
          await testBlueGreenHiveProxyRouting({
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env: targetEnv,
            runCommand: run,
          });
        }

        updateBlueGreenTargetRuntime(
          'hive',
          {
            activeColor: targetColor,
            commitHash: options.latestCommit?.hash ?? null,
            commitShortHash: options.latestCommit?.shortHash ?? null,
            deploymentStamp,
            health: 'healthy',
            lastPromotedAt: Date.now(),
            standbyColor:
              previousHiveColor !== targetColor ? previousHiveColor : null,
          },
          paths,
          fsImpl
        );
      });
    } else {
      markBlueGreenStageSkipped(stages, 'hive-migrate', 'no Hive changes');
      markBlueGreenStageSkipped(stages, 'hive-promote', 'no Hive changes');
    }

    if (supportBuildServices.length > 0) {
      await runBlueGreenStage(stages, 'support-refresh', async () => {
        if (!skipSupportBuild) {
          await buildBlueGreenServices({
            bakeFile,
            buildStrategy,
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env: targetEnv,
            fsImpl,
            rootDir: options.rootDir ?? ROOT_DIR,
            runCommand: run,
            services: supportBuildServices,
          });
        }

        await runComposeUpWithNameConflictRecovery({
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          fsImpl,
          runCommand: run,
          services: supportServices,
          upArgs: [
            'up',
            '--detach',
            '--no-build',
            '--remove-orphans',
            ...parsed.composeArgs,
            ...supportServices,
          ],
        });
        await removeDbMigrateContainersIfPresent({
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          runCommand: run,
        });

        for (const serviceName of supportServices) {
          await waitForComposeServiceHealthy(serviceName, {
            composeFile,
            composeGlobalArgs: parsed.composeGlobalArgs,
            env: targetEnv,
            runCommand: run,
          });
        }
      });
    } else {
      markBlueGreenStageSkipped(
        stages,
        'support-refresh',
        'support build inputs unchanged'
      );
    }

    writeBlueGreenSupportBuildCacheSnapshot({
      buildServices,
      commit: options.latestCommit,
      deploymentKind: options.deploymentKind ?? 'promotion',
      deploymentStamp,
      fsImpl,
      hashes: supportBuildHashes,
      paths,
      targetColor,
    });

    await runBlueGreenStage(stages, 'proxy-reload', async () => {
      const latestTargetState = readBlueGreenTargetState(paths, fsImpl);
      const promotedHiveColor =
        latestTargetState.targets.hive.activeColor ?? previousHiveColor;
      const promotedHiveStandbyColor =
        latestTargetState.targets.hive.standbyColor;

      writeBlueGreenDeploymentStamp(deploymentStamp, paths, fsImpl);
      writeBlueGreenProxyConfig(targetColor, {
        deploymentStamp,
        env: targetEnv,
        fsImpl,
        hiveColor: promotedHiveColor,
        hiveStandbyColor: promotedHiveStandbyColor,
        paths,
        standbyColor,
      });

      if (proxyBootstrapServices.length > 0) {
        await runComposeUpWithNameConflictRecovery({
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          fsImpl,
          runCommand: run,
          services: proxyBootstrapServices,
          upArgs: getBlueGreenProxyBootstrapUpArgs(
            parsed,
            proxyBootstrapServices,
            {
              forceRecreate: needsProxyRefresh,
            }
          ),
        });
        await waitForComposeServiceHealthy(BLUE_GREEN_PROXY_SERVICE, {
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          runCommand: run,
        });
      } else {
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
      }

      publicProxyPromoted = true;
      await testBlueGreenProxyRouting({
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: targetEnv,
        runCommand: run,
      });
      if (testHiveProxyRoutingAfterBootstrap) {
        await testBlueGreenHiveProxyRouting({
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env: targetEnv,
          runCommand: run,
        });
      }
      writeBlueGreenActiveColor(targetColor, paths, fsImpl);
      updateBlueGreenTargetRuntime(
        'web',
        {
          activeColor: targetColor,
          committedAt: options.latestCommit?.committedAt ?? null,
          commitHash: options.latestCommit?.hash ?? null,
          commitShortHash: options.latestCommit?.shortHash ?? null,
          deploymentStamp,
          frontend: selectedFrontend,
          health: 'healthy',
          lastPromotedAt: Date.now(),
          standbyColor,
        },
        paths,
        fsImpl
      );
    });

    if (activeColor && activeColor !== targetColor) {
      await waitForBlueGreenServiceDrain(
        getBlueGreenServiceName(activeColor, env),
        {
          composeFile,
          composeGlobalArgs: parsed.composeGlobalArgs,
          env,
          pollMs: drainPollMs,
          proxyDrainMs,
          runCommand: run,
          timeoutMs: drainTimeoutMs,
        }
      );
    }

    return {
      migration: await finalizeBlueGreenComposeMigration({
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        migration,
        now: options.now,
        runCommand: run,
      }),
      stages,
    };
  } catch (error) {
    if (publicProxyPromoted && activeColor && activeColor !== targetColor) {
      try {
        writeBlueGreenProxyConfig(activeColor, {
          deploymentStamp:
            readBlueGreenDeploymentStamp(paths, fsImpl) ?? deploymentStamp,
          env: targetEnv,
          fsImpl,
          hiveColor: previousHiveColor,
          hiveStandbyColor: previousHiveStandbyColor,
          paths,
          standbyColor: targetColor,
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
        writeBlueGreenActiveColor(activeColor, paths, fsImpl);
      } catch (rollbackError) {
        if (error && typeof error === 'object') {
          error.blueGreenRollbackError =
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError);
        }
      }
    }
    skipQueuedBlueGreenDeploymentStages(
      stages,
      error instanceof Error ? error.message : String(error)
    );
    throw attachBlueGreenDeploymentStages(error, stages);
  } finally {
    await pruneBlueGreenBuildkitCacheAfterWorkflow({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: targetEnv,
      fsImpl,
      runCommand: run,
    });
  }
}

async function runBlueGreenStandbyRefreshWorkflow(parsed, options = {}) {
  const buildRootDir = options.buildRootDir ?? ROOT_DIR;
  const runtimeRootDir = options.rootDir ?? ROOT_DIR;
  const composeFile = getComposeFileForRoot(parsed.mode, buildRootDir);
  const env = getBlueGreenProductionComposeEnvironment({
    baseEnv: options.env ?? process.env,
    envFilePath: options.envFilePath,
    fsImpl: options.fsImpl ?? fs,
    rootDir: buildRootDir,
    withCloudflared: hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared'),
    withRedis: hasComposeProfile(parsed.composeGlobalArgs, 'redis'),
    withSupportServices: true,
  });
  const fsImpl = options.fsImpl ?? fs;
  const paths = getBlueGreenPaths(runtimeRootDir);
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
  const standbyEnv = createBlueGreenBuildMetadataEnv({
    baseEnv: {
      ...env,
      PLATFORM_BLUE_GREEN_COLOR: standbyColor,
      PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
    },
    deploymentStamp,
    latestCommit: options.latestCommit,
  });
  const standbyServices = getBlueGreenProdServicesWithProxyOption(
    parsed,
    standbyColor,
    false,
    standbyEnv
  );
  const previousSupportBuildHashes = readBlueGreenSupportBuildHashes(
    paths,
    fsImpl
  );
  const supportBuildHashes = await getBlueGreenSupportBuildInputHashes({
    env: standbyEnv,
    fsImpl,
    rootDir: buildRootDir,
    runCommand: run,
    targetColor: standbyColor,
  });
  const standbyBuildServices = getBlueGreenDeploymentBuildServices({
    changedFiles: options.changedFiles,
    env: standbyEnv,
    forceBuildSupportServices: options.forceBuildSupportServices === true,
    previousSupportBuildHashes,
    supportBuildHashes,
    targetColor: standbyColor,
  });

  try {
    await buildBlueGreenServices({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: standbyEnv,
      fsImpl,
      rootDir: buildRootDir,
      runCommand: run,
      services: standbyBuildServices,
    });

    await stopComposeServicesIfPresent(
      [
        getBlueGreenServiceName(standbyColor, standbyEnv),
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
        getBlueGreenServiceName(standbyColor, standbyEnv),
        getBlueGreenHiveServiceName(standbyColor),
      ],
      {
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env,
        runCommand: run,
      }
    );

    await runHiveDbForwardMigrationsAndCleanup({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: standbyEnv,
      runCommand: run,
    });

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
    await removeDbMigrateContainersIfPresent({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: standbyEnv,
      runCommand: run,
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
      await removeDbMigrateContainersIfPresent({
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: standbyEnv,
        runCommand: run,
      });
    }

    await waitForComposeServiceHealthy(
      getBlueGreenServiceName(standbyColor, standbyEnv),
      {
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: standbyEnv,
        runCommand: run,
      }
    );

    for (const serviceName of getBlueGreenPromotionHealthGateServices(
      standbyColor,
      standbyEnv
    )) {
      await waitForComposeServiceHealthy(serviceName, {
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: standbyEnv,
        runCommand: run,
      });
    }

    writeBlueGreenDeploymentStamp(deploymentStamp, paths, fsImpl);
    writeBlueGreenSupportBuildCacheSnapshot({
      buildServices: standbyBuildServices,
      commit: options.latestCommit,
      deploymentKind: options.deploymentKind ?? 'standby-refresh',
      deploymentStamp,
      fsImpl,
      hashes: supportBuildHashes,
      paths,
      targetColor: standbyColor,
    });

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
  } finally {
    await pruneBlueGreenBuildkitCacheAfterWorkflow({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env: standbyEnv,
      fsImpl,
      runCommand: run,
    });
  }
}

async function runBlueGreenCachedRecoveryWorkflow(parsed, options = {}) {
  const composeFile = getComposeFile(parsed.mode);
  const env = getBlueGreenProductionComposeEnvironment({
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
  const selectedFrontend = getBlueGreenFrontend(env);
  const activeServiceName = getBlueGreenServiceName(
    activeColor,
    selectedFrontend
  );
  const standbyServiceName = getBlueGreenServiceName(
    standbyColor,
    selectedFrontend
  );
  const activeEnv = createBlueGreenBuildMetadataEnv({
    baseEnv: {
      ...env,
      DOCKER_WEB_FRONTEND: selectedFrontend,
      PLATFORM_BLUE_GREEN_COLOR: activeColor,
      PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
    },
    deploymentStamp,
    latestCommit: options.latestCommit,
  });
  const standbyEnv = createBlueGreenBuildMetadataEnv({
    baseEnv: {
      ...env,
      DOCKER_WEB_FRONTEND: selectedFrontend,
      PLATFORM_BLUE_GREEN_COLOR: standbyColor,
      PLATFORM_DEPLOYMENT_STAMP: deploymentStamp,
    },
    deploymentStamp,
    latestCommit: options.latestCommit,
  });
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
    env: activeEnv,
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
  await runHiveDbForwardMigrationsAndCleanup({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
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
  await removeDbMigrateContainersIfPresent({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: activeEnv,
    runCommand: run,
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
  await removeDbMigrateContainersIfPresent({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: standbyEnv,
    runCommand: run,
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
    env: standbyEnv,
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
  assertBlueGreenCachedImageExists,
  buildBlueGreenServices,
  buildNativeWebArtifacts,
  buildNativeWebRuntimeImages,
  clearBlueGreenRuntime,
  createBlueGreenBuildMetadataEnv,
  ensureBlueGreenRuntime,
  generateBlueGreenDeploymentStamp,
  getBlueGreenBakeFile,
  getBlueGreenBuildxBakeArgs,
  getBlueGreenCacheImageTag,
  getBlueGreenDeploymentBuildServices,
  getBlueGreenHealthGateSupportServices,
  getBlueGreenPaths,
  getBlueGreenSupportBuildInputHashes,
  getBlueGreenBuildTimeoutMs,
  getBlueGreenComposeMigration,
  getBlueGreenAllDirectWebServiceNames,
  getBlueGreenAllWebServiceNames,
  getBlueGreenDirectServiceName,
  getBlueGreenFrontend,
  getBlueGreenFrontendPort,
  getDeterministicBlueGreenBuildEnv,
  getBlueGreenHiveServiceName,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  getComposeServiceExpectedImage,
  getComposeServiceRunningImage,
  hasComposeServiceExpectedImage,
  hasBlueGreenProxyHostPortBindings,
  isBlueGreenSupportBuildSkipped,
  isBlueGreenWebBuildSkipped,
  isBlueGreenCronRunnerEnabled,
  isBlueGreenSupermemoryEnabled,
  readBlueGreenDeploymentStamp,
  readBlueGreenSupportBuildHashHistory,
  readBlueGreenSupportBuildHashes,
  getBlueGreenServiceName,
  getBlueGreenServiceDrainStatus,
  getBlueGreenWebServiceImageTag,
  getHostTotalMemoryBuildValue,
  getNextBlueGreenColor,
  getNativeWebBuildMemory,
  getNativeWebTurboRemoteCacheEnv,
  getNativeWebRunnerDockerBuildEnv,
  isBlueGreenColor,
  isNativeWebBuildEnabled,
  isNativeWebRunnerBuildxEnabled,
  isNativeWebSupportBuildEnabled,
  isNativeWebSupportBuildxEnabled,
  readBlueGreenActiveColor,
  readBlueGreenProxyActiveColor,
  readBlueGreenTargetState,
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
  writeBlueGreenTargetState,
};
