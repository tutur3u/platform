#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_DEFERRED_SUPPORT_SERVICES,
  BLUE_GREEN_PROXY_CONFIG_FILE,
  BLUE_GREEN_PROXY_DRAIN_MS,
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
  BLUE_GREEN_SUPPORT_SERVICES,
  BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
  clearBlueGreenRuntime,
  DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS,
  ensureBlueGreenRuntime,
  getBlueGreenAllDirectWebServiceNames,
  getBlueGreenAllWebServiceNames,
  getBlueGreenBuildTimeoutMs,
  getBlueGreenHiveServiceName,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  getBlueGreenServiceName,
  getNextBlueGreenColor,
  isBlueGreenColor,
  readBlueGreenActiveColor,
  readBlueGreenProxyActiveColor,
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  runBlueGreenProdWorkflow,
  splitBlueGreenProdServicePhases,
  testBlueGreenProxyRouting,
  testBlueGreenHiveProxyRouting,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
} = require('./docker-web/blue-green.js');
const {
  COMPOSE_FILE,
  PROD_COMPOSE_FILE,
  getComposeCommandArgs,
  getComposeFile,
  getComposeServiceContainerId,
  getComposeServiceContainerName,
  getContainerHealthStatus,
  hasComposeProfile,
  hasComposeServiceContainer,
  isComposeServiceHealthy,
  removeComposeServicesIfPresent,
  runComposeUpWithNameConflictRecovery,
  runChecked,
  runCommand,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
} = require('./docker-web/compose.js');
const {
  DEFAULT_SUPABASE_RESET_RETRY_INITIAL_DELAY_MS,
  DEFAULT_SUPABASE_RESET_RETRY_MAX_ATTEMPTS,
  DEFAULT_SUPABASE_RESET_RETRY_MAX_DELAY_MS,
  getErrorText,
  getPositiveIntegerEnv,
  isTransientSupabaseResetError,
  runSupabaseResetWithRetry,
  sleep,
  stopSupabaseBestEffort,
} = require('./docker-web/supabase-reset.js');
const {
  DOCKER_BACKEND_INTERNAL_URL,
  DOCKER_HOST_ALIAS,
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_PRONUNCIATION_ASSESSOR_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  DOCKER_WEB_BACKEND_TOKEN_FILE,
  DOCKER_WEB_CRON_TOKEN_FILE,
  DOCKER_WEB_NEXT_PRIVATE_ORIGIN,
  DOCKER_WEB_SUPERMEMORY_API_KEY_FILE,
  DOCKER_WEB_SUPERMEMORY_BETTER_AUTH_SECRET_FILE,
  DOCKER_WEB_SUPERMEMORY_POSTGRES_PASSWORD_FILE,
  DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV,
  WEB_ENV_FILE,
  classifySupabaseOrigin,
  ensureProductionRedisToken,
  ensureProductionSupabaseOrigin,
  ensureRequiredComposeEnvironment,
  formatSupabaseOriginReport,
  ensureWebEnvFile,
  getComposeEnvironment,
  getDockerSupermemoryRuntime,
  getDockerWebSupabaseOriginReport,
  parseEnvFile,
  rewriteLocalhostUrl,
  stripUnquotedInlineComment,
} = require('./docker-web/env.js');
const {
  DEFAULT_BUILDER_NAME,
  cleanupBuildkitAfterBuild,
  ensureBuildkitBuilder,
} = require('./docker-web/buildkit-builder.js');
const {
  DEPLOYMENT_KIND_ENV,
  DEPLOYMENT_STAGES_FILE_ENV,
  SKIP_WATCH_HISTORY_ENV,
  appendDeploymentHistory,
  readDeploymentHistory,
  writeDeploymentStagesHandoff,
} = require('./watch-blue-green/history.js');
const { getWatchPaths } = require('./watch-blue-green/paths.js');
const {
  WATCHER_CONTAINER_ENV,
  startBlueGreenWatcherContainer,
} = require('./watch-blue-green-deploy.js');
const {
  cancelActiveBlueGreenBuild,
} = require('./watch-blue-green/active-build-cancel.js');
const {
  CANCEL_ACTIVE_BUILD_ENV,
  DEPLOYMENT_BUILD_LOCK_TOKEN_ENV,
  acquireDeploymentBuildLock,
  describeActiveDeploymentConflict,
  getActiveDeploymentConflict,
} = require('./watch-blue-green/build-lock.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLOUDFLARED_SERVICE = 'cloudflared';
const LOG_DRAIN_POSTGRES_SERVICE = 'log-drain-postgres';
const LOG_DRAIN_REQUIRED_ENV = 'DOCKER_WEB_LOG_DRAIN_REQUIRED';
const LOG_DRAIN_ENABLED_ENV = 'PLATFORM_LOG_DRAIN_ENABLED';
const LOG_DRAIN_DIAGNOSTIC_LOG_TAIL = 200;
const LOW_DOCKER_MEMORY_BUILDKIT_RESTART_THRESHOLD_BYTES =
  10 * 1024 * 1024 * 1024;

async function getCurrentGitCommitMetadata({
  env,
  runCommand: run = runCommand,
} = {}) {
  try {
    const result = await runChecked(
      'git',
      ['log', '-1', '--format=%H%n%h%n%s'],
      {
        env,
        runCommand: run,
        stdio: 'pipe',
      }
    );
    const [hash, shortHash, subject] = result.stdout.trim().split('\n');
    let refName = env?.PLATFORM_BUILD_REF_NAME || env?.GITHUB_REF_NAME || null;

    if (!refName) {
      try {
        const branchResult = await runChecked(
          'git',
          ['branch', '--show-current'],
          {
            env,
            runCommand: run,
            stdio: 'pipe',
          }
        );

        refName = branchResult.stdout.trim() || null;
      } catch {
        refName = null;
      }
    }

    return {
      hash: hash || null,
      refName,
      shortHash: shortHash || null,
      subject: subject || null,
    };
  } catch {
    return {
      hash: null,
      refName: env?.PLATFORM_BUILD_REF_NAME || env?.GITHUB_REF_NAME || null,
      shortHash: null,
      subject: null,
    };
  }
}

function getLatestSuccessfulDeploymentCommitHash(deployments = []) {
  const deployment = deployments.find(
    (entry) =>
      entry?.status === 'successful' &&
      typeof entry.commitHash === 'string' &&
      entry.commitHash.length > 0
  );

  return deployment?.commitHash ?? null;
}

async function getChangedFilesBetweenCommits({
  env,
  fromCommitHash,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  toCommitHash,
} = {}) {
  if (!fromCommitHash || !toCommitHash) {
    return null;
  }

  if (fromCommitHash === toCommitHash) {
    return [];
  }

  try {
    const result = await runChecked(
      'git',
      ['diff', '--name-only', fromCommitHash, toCommitHash],
      {
        cwd: rootDir,
        env,
        runCommand: run,
        stdio: 'pipe',
      }
    );

    return result.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

async function getBlueGreenDeploymentChangedFiles({
  env,
  fsImpl = fs,
  latestCommit,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const history = readDeploymentHistory(getWatchPaths(rootDir), fsImpl);
  const latestSuccessfulCommitHash =
    getLatestSuccessfulDeploymentCommitHash(history);

  return getChangedFilesBetweenCommits({
    env,
    fromCommitHash: latestSuccessfulCommitHash,
    rootDir,
    runCommand: run,
    toCommitHash: latestCommit?.hash,
  });
}

async function getDockerMemoryLimit({
  env,
  runCommand: run = runCommand,
} = {}) {
  const result = await run(
    'docker',
    ['info', '--format', '{{json .MemTotal}}'],
    {
      env,
      stdio: 'pipe',
    }
  );

  if (result.code !== 0) {
    return null;
  }

  const parsed = Number.parseInt(result.stdout.trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return String(parsed);
}

async function applyDockerMemoryLimitEnv(composeEnv, { env, runCommand: run }) {
  if (composeEnv.DOCKER_WEB_DOCKER_MEMORY_LIMIT) {
    return composeEnv;
  }

  const dockerMemoryLimit = await getDockerMemoryLimit({
    env,
    runCommand: run,
  });

  if (!dockerMemoryLimit) {
    return composeEnv;
  }

  return {
    ...composeEnv,
    DOCKER_WEB_DOCKER_MEMORY_LIMIT: dockerMemoryLimit,
  };
}

function applyLowMemoryBuildkitRestartEnv(composeEnv, parsed) {
  if (
    !usesBlueGreenStrategy(parsed) ||
    composeEnv.DOCKER_WEB_BUILDKIT_RESTART_BEFORE_BUILD != null
  ) {
    return composeEnv;
  }

  const dockerMemoryLimit = Number.parseInt(
    String(composeEnv.DOCKER_WEB_DOCKER_MEMORY_LIMIT ?? ''),
    10
  );

  if (
    !Number.isFinite(dockerMemoryLimit) ||
    dockerMemoryLimit >= LOW_DOCKER_MEMORY_BUILDKIT_RESTART_THRESHOLD_BYTES
  ) {
    return composeEnv;
  }

  return {
    ...composeEnv,
    DOCKER_WEB_BUILDKIT_RESTART_BEFORE_BUILD: '1',
  };
}

function getSupabaseStartExcludeArgs(env = {}) {
  const rawValue = env.DOCKER_WEB_SUPABASE_START_EXCLUDE;

  if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
    return [];
  }

  return rawValue
    .split(',')
    .map((serviceName) => serviceName.trim())
    .filter(Boolean)
    .flatMap((serviceName) => ['--exclude', serviceName]);
}

function getSupabaseStartCommand(env = {}) {
  const excludeArgs = getSupabaseStartExcludeArgs(env);

  if (excludeArgs.length === 0) {
    return {
      args: ['sb:start'],
      command: 'bun',
      cwd: ROOT_DIR,
    };
  }

  return {
    args: ['sb:start', '--', ...excludeArgs],
    command: 'bun',
    cwd: ROOT_DIR,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const action = args.shift() ?? 'up';

  if (action !== 'up' && action !== 'down') {
    throw new Error(`Unsupported action "${action}". Use "up" or "down".`);
  }

  const composeGlobalArgs = [];
  const composeArgs = [];
  let mode = 'dev';
  let strategy = 'in-place';
  let withSupabase = false;
  let resetSupabase = false;
  let withRedis = true;
  let withCloudflared = false;
  let buildMemory = null;
  let buildCpus = null;
  let buildMaxParallelism = null;
  let buildBuilderName = null;
  let cancelActiveBuild = false;
  let envFilePath = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--with-supabase') {
      withSupabase = true;
      continue;
    }

    if (arg === '--reset-supabase') {
      withSupabase = true;
      resetSupabase = true;
      continue;
    }

    if (arg === '--without-redis') {
      withRedis = false;
      continue;
    }

    if (arg === '--with-cloudflared') {
      withCloudflared = true;
      continue;
    }

    if (arg === '--cancel-active-build') {
      cancelActiveBuild = true;
      continue;
    }

    if (arg === '--env-file') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Expected an env file path after --env-file.');
      }

      envFilePath = value;
      index += 1;
      continue;
    }

    if (arg === '--blue-green') {
      strategy = 'blue-green';
      continue;
    }

    if (arg === '--profile') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Expected a profile name after --profile.');
      }

      composeGlobalArgs.push(arg, value);
      index += 1;
      continue;
    }

    if (arg === '-p' || arg === '--project-name') {
      const value = args[index + 1];

      if (!value) {
        throw new Error(`Expected a project name after ${arg}.`);
      }

      composeGlobalArgs.push(arg, value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--project-name=')) {
      const value = arg.slice('--project-name='.length).trim();

      if (!value) {
        throw new Error('Expected a project name after --project-name=.');
      }

      composeGlobalArgs.push(arg);
      continue;
    }

    if (arg === '--mode') {
      const value = args[index + 1];

      if (value !== 'dev' && value !== 'prod') {
        throw new Error('Expected --mode to be either "dev" or "prod".');
      }

      mode = value;
      index += 1;
      continue;
    }

    if (arg === '--build-memory') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Expected a memory value after --build-memory.');
      }

      buildMemory = value;
      index += 1;
      continue;
    }

    if (arg === '--build-cpus') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Expected a CPU value after --build-cpus.');
      }

      buildCpus = value;
      index += 1;
      continue;
    }

    if (arg === '--build-max-parallelism') {
      const value = args[index + 1];

      if (!value) {
        throw new Error(
          'Expected an integer value after --build-max-parallelism.'
        );
      }

      buildMaxParallelism = value;
      index += 1;
      continue;
    }

    if (arg === '--build-builder-name') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('Expected a builder name after --build-builder-name.');
      }

      buildBuilderName = value;
      index += 1;
      continue;
    }

    if (arg === '--strategy') {
      const value = args[index + 1];

      if (value !== 'in-place' && value !== 'blue-green') {
        throw new Error(
          'Expected --strategy to be either "in-place" or "blue-green".'
        );
      }

      strategy = value;
      index += 1;
      continue;
    }

    composeArgs.push(arg);
  }

  if (withCloudflared && !hasComposeProfile(composeGlobalArgs, 'cloudflared')) {
    composeGlobalArgs.push('--profile', 'cloudflared');
  }

  if (withRedis && !hasComposeProfile(composeGlobalArgs, 'redis')) {
    composeGlobalArgs.push('--profile', 'redis');
  }

  return {
    action,
    composeArgs,
    composeGlobalArgs,
    ...(envFilePath ? { envFilePath } : {}),
    mode,
    resetSupabase,
    strategy,
    buildBuilderName,
    buildCpus,
    buildMaxParallelism,
    buildMemory,
    cancelActiveBuild,
    withSupabase,
    withRedis,
  };
}

function usesBlueGreenStrategy(parsed) {
  return parsed.mode === 'prod' && parsed.strategy === 'blue-green';
}

function isTruthyEnv(value) {
  return /^(1|true|yes)$/iu.test(String(value ?? '').trim());
}

function isFalseyEnv(value) {
  return /^(0|false|no|off)$/iu.test(String(value ?? '').trim());
}

async function pruneDockerWebBuildkitCacheAfterWorkflow({
  composeFile,
  composeGlobalArgs = [],
  env,
  fsImpl = fs,
  runCommand: run = runCommand,
}) {
  if (!env?.BUILDX_BUILDER && !env?.DOCKER_WEB_BUILD_BUILDER_NAME) {
    return;
  }

  try {
    await cleanupBuildkitAfterBuild({
      composeFile,
      composeGlobalArgs,
      env,
      fsImpl,
      runCommand: run,
    });
  } catch (cleanupError) {
    const message =
      cleanupError instanceof Error
        ? cleanupError.message
        : String(cleanupError);
    process.stderr.write(
      `[docker-web] Warning: failed to clean up BuildKit after workflow: ${message}\n`
    );
  }
}

function ensureCloudflaredProfileFromEnv(parsed, env) {
  if (
    !hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared') &&
    isTruthyEnv(env.DOCKER_WEB_WITH_CLOUDFLARED)
  ) {
    parsed.composeGlobalArgs.push('--profile', 'cloudflared');
  }
}

function getInPlaceProdServices(parsed) {
  const services = ['web'];

  if (hasComposeProfile(parsed.composeGlobalArgs, 'redis')) {
    services.push('redis', 'serverless-redis-http');
  }

  if (hasComposeProfile(parsed.composeGlobalArgs, 'cloudflared')) {
    services.push(CLOUDFLARED_SERVICE);
  }

  return services;
}

function isLogDrainPostgresStartupError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /\blog-drain-postgres\b/iu.test(message) ||
    /dependency failed to start/iu.test(message)
  );
}

function trimDiagnosticOutput(output, maxBytes = 24_000) {
  if (!output) {
    return '';
  }

  if (Buffer.byteLength(output, 'utf8') <= maxBytes) {
    return output.trimEnd();
  }

  return `[truncated to last ${maxBytes} bytes]\n${output
    .slice(-maxBytes)
    .trimEnd()}`;
}

function formatDiagnosticCommand(command, args) {
  return [command, ...args].join(' ');
}

async function collectLogDrainPostgresCommandDiagnostic({
  args,
  command = 'docker',
  env,
  label,
  runCommand: run,
}) {
  try {
    const result = await run(command, args, {
      env,
      stdio: 'pipe',
    });
    const output = trimDiagnosticOutput(
      [result.stdout, result.stderr].filter(Boolean).join('\n')
    );
    const status =
      result.code === 0
        ? ''
        : ` (exit ${result.code}${result.signal ? `, signal ${result.signal}` : ''})`;

    return [
      `${label}${status}: ${formatDiagnosticCommand(command, args)}`,
      output || '(no output)',
    ].join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return [
      `${label}: ${formatDiagnosticCommand(command, args)}`,
      `Unable to collect diagnostic output: ${message}`,
    ].join('\n');
  }
}

async function collectLogDrainPostgresDiagnostics({
  composeFile,
  composeGlobalArgs = [],
  env,
  runCommand: run = runCommand,
}) {
  const sections = [];
  const composePrefix = getComposeCommandArgs(composeFile, composeGlobalArgs);

  sections.push(
    await collectLogDrainPostgresCommandDiagnostic({
      args: [...composePrefix, 'ps', '--all', LOG_DRAIN_POSTGRES_SERVICE],
      env,
      label: 'Compose service state',
      runCommand: run,
    })
  );

  const containerId = await getComposeServiceContainerId(
    LOG_DRAIN_POSTGRES_SERVICE,
    {
      composeFile,
      composeGlobalArgs,
      env,
      includeStopped: true,
      runCommand: run,
    }
  ).catch(() => null);

  if (containerId) {
    sections.push(
      await collectLogDrainPostgresCommandDiagnostic({
        args: ['inspect', '-f', '{{json .State}}', containerId],
        env,
        label: 'Container state',
        runCommand: run,
      })
    );
  }

  sections.push(
    await collectLogDrainPostgresCommandDiagnostic({
      args: [
        ...composePrefix,
        'logs',
        '--no-color',
        '--tail',
        String(LOG_DRAIN_DIAGNOSTIC_LOG_TAIL),
        LOG_DRAIN_POSTGRES_SERVICE,
      ],
      env,
      label: 'Recent service logs',
      runCommand: run,
    })
  );

  sections.push(
    await collectLogDrainPostgresCommandDiagnostic({
      args: [
        'volume',
        'ls',
        '--filter',
        'label=com.docker.compose.volume=platform-log-drain-postgres',
        '--format',
        '{{.Name}}',
      ],
      env,
      label: 'Matching log-drain volumes',
      runCommand: run,
    })
  );

  return sections.filter(Boolean).join('\n\n');
}

function createLogDrainPostgresDegradedEnvironment(env = {}) {
  return {
    ...env,
    [LOG_DRAIN_ENABLED_ENV]: 'false',
  };
}

function createLogDrainPostgresFailureMessage(
  error,
  { continuing, diagnostics = '', required = false } = {}
) {
  const detail = error instanceof Error ? error.message : String(error);
  const shouldContinue = continuing ?? !required;
  const lines = [
    `${LOG_DRAIN_POSTGRES_SERVICE} failed to start before blue/green promotion.`,
    'The deploy helper retried once after removing only the service container; no persistent Docker volumes were removed.',
  ];

  if (shouldContinue) {
    lines.push(
      `Continuing this deploy with ${LOG_DRAIN_ENABLED_ENV}=false so the app can promote with log-drain telemetry disabled.`
    );
    lines.push(
      `Set ${LOG_DRAIN_REQUIRED_ENV}=1 to make log-drain-postgres a hard deployment gate.`
    );
  } else if (required) {
    lines.push(
      `${LOG_DRAIN_REQUIRED_ENV}=1 is set, so log-drain-postgres remains a hard deployment gate.`
    );
  } else {
    lines.push(
      'The deploy helper could not classify this as a safe log-drain-only startup failure, so deployment is blocked.'
    );
  }

  lines.push(
    `Inspect the service with: docker compose -f docker-compose.web.prod.yml --profile redis logs --tail ${LOG_DRAIN_DIAGNOSTIC_LOG_TAIL} ${LOG_DRAIN_POSTGRES_SERVICE}`,
    'If the logs mention incompatible database files or data-directory corruption, back up or migrate the Compose volume labeled com.docker.compose.volume=platform-log-drain-postgres before retrying.',
    'Do not run docker compose down --volumes or docker volume rm for log-drain data unless an operator has explicitly approved a backed-up reset.',
    `Original failure: ${detail}`
  );

  if (diagnostics) {
    lines.push(
      `Diagnostics collected before ${shouldContinue ? 'continuing' : 'failing'}:\n${diagnostics}`
    );
  }

  return lines.join('\n');
}

async function getComposeServiceStatus(serviceName, options) {
  const containerId = await getComposeServiceContainerId(serviceName, {
    ...options,
    includeStopped: true,
  });

  if (!containerId) {
    return null;
  }

  try {
    return await getContainerHealthStatus(containerId, options);
  } catch {
    return 'unknown';
  }
}

async function ensureLogDrainPostgresReady({
  composeFile,
  composeGlobalArgs = [],
  env,
  fsImpl = fs,
  healthPollMs,
  healthTimeoutMs,
  runCommand: run = runCommand,
  stderr = process.stderr,
}) {
  if (isFalseyEnv(env?.[LOG_DRAIN_ENABLED_ENV])) {
    return {
      env: createLogDrainPostgresDegradedEnvironment(env),
      ready: false,
      skipped: true,
    };
  }

  if (
    await isComposeServiceHealthy(LOG_DRAIN_POSTGRES_SERVICE, {
      composeFile,
      composeGlobalArgs,
      env,
      runCommand: run,
    })
  ) {
    return {
      env,
      ready: true,
    };
  }

  const options = {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  };
  const start = async () => {
    await runComposeUpWithNameConflictRecovery({
      composeFile,
      composeGlobalArgs,
      env,
      fsImpl,
      runCommand: run,
      services: [LOG_DRAIN_POSTGRES_SERVICE],
      upArgs: [
        'up',
        '--detach',
        '--no-build',
        '--remove-orphans',
        LOG_DRAIN_POSTGRES_SERVICE,
      ],
    });
    await waitForComposeServiceHealthy(LOG_DRAIN_POSTGRES_SERVICE, {
      ...options,
      ...(healthPollMs === undefined ? {} : { pollMs: healthPollMs }),
      ...(healthTimeoutMs === undefined ? {} : { timeoutMs: healthTimeoutMs }),
    });
  };

  try {
    await start();
    return {
      env,
      ready: true,
    };
  } catch (error) {
    const status = await getComposeServiceStatus(
      LOG_DRAIN_POSTGRES_SERVICE,
      options
    );
    const shouldRetry =
      status === 'dead' ||
      status === 'exited' ||
      isLogDrainPostgresStartupError(error);

    if (!shouldRetry) {
      const diagnostics = await collectLogDrainPostgresDiagnostics(options);
      throw new Error(
        createLogDrainPostgresFailureMessage(error, {
          continuing: false,
          diagnostics,
          required: isTruthyEnv(env?.[LOG_DRAIN_REQUIRED_ENV]),
        })
      );
    }

    stderr.write(
      `[docker-web] ${LOG_DRAIN_POSTGRES_SERVICE} did not become healthy (${status ?? 'unknown'}); removing the service container and retrying once.\n`
    );

    await removeComposeServicesIfPresent([LOG_DRAIN_POSTGRES_SERVICE], {
      composeFile,
      composeGlobalArgs,
      env,
      runCommand: run,
    });
  }

  try {
    await start();
    return {
      env,
      ready: true,
    };
  } catch (error) {
    const diagnostics = await collectLogDrainPostgresDiagnostics(options);
    const required = isTruthyEnv(env?.[LOG_DRAIN_REQUIRED_ENV]);
    const message = createLogDrainPostgresFailureMessage(error, {
      diagnostics,
      required,
    });

    if (required) {
      throw new Error(message);
    }

    stderr.write(`[docker-web] Warning: ${message}\n`);

    return {
      diagnostics,
      env: createLogDrainPostgresDegradedEnvironment(env),
      ready: false,
    };
  }
}

async function promptForActiveDeploymentCancellation(
  conflict,
  {
    confirmActiveBuildCancellation,
    input = process.stdin,
    output = process.stdout,
  } = {}
) {
  if (typeof confirmActiveBuildCancellation === 'function') {
    return await confirmActiveBuildCancellation(conflict);
  }

  if (!input?.isTTY || !output?.isTTY) {
    return false;
  }

  const rl = readline.createInterface({ input, output });

  try {
    const answer = await new Promise((resolve) => {
      rl.question(
        `Active blue/green deployment detected (${describeActiveDeploymentConflict(conflict)}). Stop it and start this deployment? [y/N] `,
        resolve
      );
    });

    return /^(y|yes)$/iu.test(String(answer).trim());
  } finally {
    rl.close();
  }
}

async function resolveManualBlueGreenBuildConflict({
  composeEnv,
  env,
  fsImpl = fs,
  latestCommit,
  now = () => Date.now(),
  parsed,
  paths = getWatchPaths(),
  platform,
  processImpl = process,
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
  ...promptOptions
} = {}) {
  const conflict = getActiveDeploymentConflict({
    env,
    fsImpl,
    now,
    paths,
    platform,
    processImpl,
  });

  if (!conflict) {
    return null;
  }

  const canCancel =
    parsed?.cancelActiveBuild || isTruthyEnv(env?.[CANCEL_ACTIVE_BUILD_ENV]);
  const confirmed =
    canCancel ||
    (await promptForActiveDeploymentCancellation(conflict, promptOptions));

  if (!confirmed) {
    throw new Error(
      `Active blue/green deployment build detected (${describeActiveDeploymentConflict(conflict)}). Re-run with --cancel-active-build or DOCKER_WEB_CANCEL_ACTIVE_BUILD=1 to cancel it before starting a fresh deployment.`
    );
  }

  return cancelActiveBlueGreenBuild({
    cancellationSource: 'manual blue/green deploy',
    composeEnv,
    conflict,
    fsImpl,
    latestCommit,
    now,
    paths,
    processImpl,
    rootDir,
    runCommand: run,
  });
}

async function runDockerWebWorkflow(parsed, options = {}) {
  const run = options.runCommand ?? runCommand;
  const fsImpl = options.fsImpl ?? fs;
  const startWatcherContainer =
    options.startWatcherContainer ?? startBlueGreenWatcherContainer;
  const composeFile = getComposeFile(parsed.mode);
  const env = options.env ?? process.env;
  const envFilePath = options.envFilePath ?? parsed.envFilePath;
  const processImpl = options.processImpl ?? process;
  const now = options.now ?? (() => Date.now());
  const sleepImpl = options.sleep ?? sleep;
  ensureCloudflaredProfileFromEnv(parsed, env);
  const withRedis = hasComposeProfile(parsed.composeGlobalArgs, 'redis');
  const withCloudflared = hasComposeProfile(
    parsed.composeGlobalArgs,
    'cloudflared'
  );

  await runChecked('docker', ['compose', 'version'], {
    env,
    fsImpl,
    runCommand: run,
    stdio: 'ignore',
  });

  if (parsed.action === 'down') {
    const composeEnv = getComposeEnvironment({
      baseEnv: env,
      envFilePath,
      fsImpl,
      preferEnvFilePath: parsed.mode === 'prod',
      rootDir: options.rootDir,
      withCloudflared,
      withRedis,
    });

    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        parsed.composeGlobalArgs,
        'down',
        '--remove-orphans',
        ...parsed.composeArgs
      ),
      {
        env: composeEnv,
        fsImpl,
        runCommand: run,
      }
    );

    if (usesBlueGreenStrategy(parsed)) {
      clearBlueGreenRuntime(
        getBlueGreenPaths(options.rootDir ?? ROOT_DIR),
        fsImpl
      );
    }

    return;
  }

  ensureWebEnvFile(fsImpl, envFilePath, options.rootDir ?? ROOT_DIR);
  ensureProductionRedisToken(parsed, env, hasComposeProfile, {
    fsImpl,
    rootDir: options.rootDir,
  });
  let composeEnv = getComposeEnvironment({
    baseEnv: env,
    envFilePath,
    fsImpl,
    preferEnvFilePath: parsed.mode === 'prod',
    rootDir: options.rootDir,
    withCloudflared,
    withRedis,
  });
  composeEnv = await applyDockerMemoryLimitEnv(composeEnv, {
    env,
    runCommand: run,
  });
  composeEnv = applyLowMemoryBuildkitRestartEnv(composeEnv, parsed);

  if (parsed.mode === 'prod') {
    ensureProductionSupabaseOrigin({
      baseEnv: env,
      composeEnv,
      envFilePath,
      fsImpl,
      rootDir: options.rootDir ?? ROOT_DIR,
    });
  }

  const watchPaths = getWatchPaths(options.rootDir ?? ROOT_DIR);
  let blueGreenBuildLock = null;
  let deployLockSignalCleanup = null;
  let latestBlueGreenCommit = null;
  let blueGreenDeployStartedAt = null;

  if (usesBlueGreenStrategy(parsed)) {
    latestBlueGreenCommit = await getCurrentGitCommitMetadata({
      env,
      runCommand: run,
    });

    if (!env[DEPLOYMENT_BUILD_LOCK_TOKEN_ENV]) {
      await resolveManualBlueGreenBuildConflict({
        composeEnv,
        confirmActiveBuildCancellation: options.confirmActiveBuildCancellation,
        env,
        fsImpl,
        input: options.input,
        latestCommit: latestBlueGreenCommit,
        now,
        output: options.output,
        parsed,
        paths: watchPaths,
        processImpl,
        rootDir: options.rootDir ?? ROOT_DIR,
        runCommand: run,
      });
    }

    blueGreenDeployStartedAt = now();
    blueGreenBuildLock = acquireDeploymentBuildLock({
      command: 'bun serve:web:docker:bg',
      deploymentKind: 'manual',
      env,
      fsImpl,
      latestCommit: latestBlueGreenCommit,
      now,
      paths: watchPaths,
      processImpl,
    });
    deployLockSignalCleanup = () => {
      blueGreenBuildLock?.release();
    };
    process.once('SIGTERM', deployLockSignalCleanup);
    process.once('SIGINT', deployLockSignalCleanup);
  }

  try {
    composeEnv = await ensureBuildkitBuilder(
      {
        builderName: parsed.buildBuilderName,
        cpus: parsed.buildCpus,
        maxParallelism: parsed.buildMaxParallelism,
        memory: parsed.buildMemory,
      },
      {
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: composeEnv,
        fsImpl,
        rootDir: options.rootDir,
        runCommand: run,
      }
    );
    ensureRequiredComposeEnvironment(composeEnv, {
      withCloudflared,
      withRedis,
    });

    if (parsed.withSupabase) {
      const supabaseStartCommand = getSupabaseStartCommand(env);
      await runChecked(
        supabaseStartCommand.command,
        supabaseStartCommand.args,
        {
          cwd: supabaseStartCommand.cwd,
          env,
          fsImpl,
          runCommand: run,
        }
      );
    }

    if (parsed.resetSupabase) {
      await runSupabaseResetWithRetry({
        env,
        fsImpl,
        runCommand: run,
        sleep: sleepImpl,
      });
    }
  } catch (error) {
    if (deployLockSignalCleanup) {
      process.off('SIGTERM', deployLockSignalCleanup);
      process.off('SIGINT', deployLockSignalCleanup);
      deployLockSignalCleanup = null;
    }
    blueGreenBuildLock?.release();
    throw error;
  }

  if (usesBlueGreenStrategy(parsed)) {
    const deployStartedAt = blueGreenDeployStartedAt ?? now();
    const latestCommit =
      latestBlueGreenCommit ??
      (await getCurrentGitCommitMetadata({
        env,
        runCommand: run,
      }));
    const workflowBaseEnv = {
      ...composeEnv,
      DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD:
        composeEnv.DOCKER_WEB_BUILDKIT_PRUNE_AFTER_BUILD ?? '0',
      DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD:
        composeEnv.DOCKER_WEB_BUILDKIT_STOP_AFTER_BUILD ?? '1',
    };
    let workflowEnv = workflowBaseEnv;
    let workflowEnvWithoutLock = workflowBaseEnv;

    try {
      const logDrainPostgresState = await ensureLogDrainPostgresReady({
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: workflowBaseEnv,
        fsImpl,
        runCommand: run,
      });
      workflowEnvWithoutLock = logDrainPostgresState?.env ?? workflowBaseEnv;
      workflowEnv = blueGreenBuildLock
        ? {
            ...workflowEnvWithoutLock,
            [DEPLOYMENT_BUILD_LOCK_TOKEN_ENV]: blueGreenBuildLock.token,
          }
        : workflowEnvWithoutLock;
      const changedFiles = await getBlueGreenDeploymentChangedFiles({
        env,
        fsImpl,
        latestCommit,
        rootDir: options.rootDir ?? ROOT_DIR,
        runCommand: run,
      });
      const workflowResult = await runBlueGreenProdWorkflow(parsed, {
        buildStrategy: options.buildStrategy ?? 'bake',
        changedFiles,
        drainPollMs: options.drainPollMs,
        drainTimeoutMs: options.drainTimeoutMs,
        env: workflowEnv,
        envFilePath,
        fsImpl,
        latestCommit,
        proxyDrainMs: options.proxyDrainMs,
        rootDir: options.rootDir,
        runCommand: run,
      });
      writeDeploymentStagesHandoff(
        {
          commitHash: latestCommit.hash,
          deploymentKind: env[DEPLOYMENT_KIND_ENV] ?? null,
          stages: workflowResult.stages,
          status: 'successful',
        },
        env[DEPLOYMENT_STAGES_FILE_ENV],
        fsImpl
      );

      if (env[SKIP_WATCH_HISTORY_ENV] !== '1') {
        const deployFinishedAt = Date.now();
        const blueGreenPaths = getBlueGreenPaths(options.rootDir ?? ROOT_DIR);

        appendDeploymentHistory(
          {
            activatedAt: deployFinishedAt,
            activeColor: readBlueGreenActiveColor(blueGreenPaths, fsImpl),
            buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            finishedAt: deployFinishedAt,
            stages: workflowResult.stages,
            startedAt: deployStartedAt,
            status: 'successful',
          },
          {
            fsImpl,
            paths: getWatchPaths(options.rootDir ?? ROOT_DIR),
          }
        );
      }

      if (env[WATCHER_CONTAINER_ENV] !== '1') {
        const watcherEnvBase =
          logDrainPostgresState?.ready === false
            ? {
                ...env,
                [LOG_DRAIN_ENABLED_ENV]:
                  workflowEnvWithoutLock[LOG_DRAIN_ENABLED_ENV],
              }
            : env;

        await startWatcherContainer(['--resume-if-running'], {
          env: withCloudflared
            ? {
                ...watcherEnvBase,
                DOCKER_WEB_WITH_CLOUDFLARED: '1',
              }
            : watcherEnvBase,
          envFilePath,
          fsImpl,
          rootDir: options.rootDir,
          runCommand: run,
        });
      }
    } catch (error) {
      writeDeploymentStagesHandoff(
        {
          commitHash: latestCommit.hash,
          deploymentKind: env[DEPLOYMENT_KIND_ENV] ?? null,
          stages:
            error && typeof error === 'object'
              ? error.blueGreenStages
              : undefined,
          status: 'failed',
        },
        env[DEPLOYMENT_STAGES_FILE_ENV],
        fsImpl
      );

      if (env[SKIP_WATCH_HISTORY_ENV] !== '1') {
        const deployFinishedAt = Date.now();

        appendDeploymentHistory(
          {
            activeColor: readBlueGreenActiveColor(
              getBlueGreenPaths(options.rootDir ?? ROOT_DIR),
              fsImpl
            ),
            buildDurationMs: Math.max(0, deployFinishedAt - deployStartedAt),
            commitHash: latestCommit.hash,
            commitShortHash: latestCommit.shortHash,
            commitSubject: latestCommit.subject,
            finishedAt: deployFinishedAt,
            stages:
              error && typeof error === 'object'
                ? error.blueGreenStages
                : undefined,
            startedAt: deployStartedAt,
            status: 'failed',
          },
          {
            fsImpl,
            paths: getWatchPaths(options.rootDir ?? ROOT_DIR),
          }
        );
      }

      throw error;
    } finally {
      await pruneDockerWebBuildkitCacheAfterWorkflow({
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: workflowEnv,
        fsImpl,
        runCommand: run,
      });

      if (deployLockSignalCleanup) {
        process.off('SIGTERM', deployLockSignalCleanup);
        process.off('SIGINT', deployLockSignalCleanup);
        deployLockSignalCleanup = null;
      }
      blueGreenBuildLock?.release();
    }

    return;
  }

  if (parsed.mode === 'prod') {
    await stopComposeServicesIfPresent(
      [
        BLUE_GREEN_PROXY_SERVICE,
        ...getBlueGreenAllDirectWebServiceNames(),
        ...getBlueGreenAllWebServiceNames(),
      ],
      {
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env: composeEnv,
        runCommand: run,
      }
    );
  }

  await runComposeUpWithNameConflictRecovery({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env: composeEnv,
    fsImpl,
    runCommand: run,
    services: parsed.mode === 'prod' ? getInPlaceProdServices(parsed) : [],
    upArgs: [
      'up',
      '--build',
      '--remove-orphans',
      ...parsed.composeArgs,
      ...(parsed.mode === 'prod' ? getInPlaceProdServices(parsed) : []),
    ],
  });
}

async function main(argv = process.argv.slice(2), options = {}) {
  try {
    const parsed = parseArgs(argv);
    await runDockerWebWorkflow(parsed, options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode =
      error && typeof error === 'object' && typeof error.exitCode === 'number'
        ? error.exitCode
        : 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_PROXY_CONFIG_FILE,
  BLUE_GREEN_PROXY_DRAIN_MS,
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
  BLUE_GREEN_DEFERRED_SUPPORT_SERVICES,
  BLUE_GREEN_SUPPORT_SERVICES,
  BLUE_GREEN_SUPPORT_SERVICES_HEALTH_GATE,
  CLOUDFLARED_SERVICE,
  COMPOSE_FILE,
  DEFAULT_BLUE_GREEN_BUILD_TIMEOUT_MS,
  DEFAULT_SUPABASE_RESET_RETRY_INITIAL_DELAY_MS,
  DEFAULT_SUPABASE_RESET_RETRY_MAX_ATTEMPTS,
  DEFAULT_SUPABASE_RESET_RETRY_MAX_DELAY_MS,
  DOCKER_HOST_ALIAS,
  DOCKER_BACKEND_INTERNAL_URL,
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_PRONUNCIATION_ASSESSOR_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  DOCKER_WEB_BACKEND_TOKEN_FILE,
  DOCKER_WEB_CRON_TOKEN_FILE,
  DOCKER_WEB_NEXT_PRIVATE_ORIGIN,
  DOCKER_WEB_ALLOW_LOCAL_SUPABASE_ENV,
  DOCKER_WEB_SUPERMEMORY_API_KEY_FILE,
  DOCKER_WEB_SUPERMEMORY_BETTER_AUTH_SECRET_FILE,
  DOCKER_WEB_SUPERMEMORY_POSTGRES_PASSWORD_FILE,
  DEFAULT_BUILDER_NAME,
  PROD_COMPOSE_FILE,
  WEB_ENV_FILE,
  clearBlueGreenRuntime,
  cancelActiveBlueGreenBuild,
  classifySupabaseOrigin,
  describeActiveDeploymentConflict,
  ensureBuildkitBuilder,
  ensureBlueGreenRuntime,
  ensureProductionRedisToken,
  ensureProductionSupabaseOrigin,
  ensureRequiredComposeEnvironment,
  ensureWebEnvFile,
  getBlueGreenBuildTimeoutMs,
  getBlueGreenDeploymentChangedFiles,
  getBlueGreenHiveServiceName,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  getBlueGreenServiceName,
  getActiveDeploymentConflict,
  getComposeEnvironment,
  getComposeFile,
  getDockerWebSupabaseOriginReport,
  getComposeServiceContainerId,
  getComposeServiceContainerName,
  getContainerHealthStatus,
  getDockerSupermemoryRuntime,
  formatSupabaseOriginReport,
  getChangedFilesBetweenCommits,
  getErrorText,
  getInPlaceProdServices,
  getLatestSuccessfulDeploymentCommitHash,
  getNextBlueGreenColor,
  getPositiveIntegerEnv,
  hasComposeProfile,
  hasComposeServiceContainer,
  ensureLogDrainPostgresReady,
  isTransientSupabaseResetError,
  isComposeServiceHealthy,
  isBlueGreenColor,
  main,
  parseArgs,
  parseEnvFile,
  readBlueGreenActiveColor,
  readBlueGreenProxyActiveColor,
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  resolveManualBlueGreenBuildConflict,
  splitBlueGreenProdServicePhases,
  rewriteLocalhostUrl,
  runDockerWebWorkflow,
  runComposeUpWithNameConflictRecovery,
  runChecked,
  runSupabaseResetWithRetry,
  sleep,
  stopSupabaseBestEffort,
  stripUnquotedInlineComment,
  testBlueGreenProxyRouting,
  testBlueGreenHiveProxyRouting,
  usesBlueGreenStrategy,
  waitForComposeServiceHealthy,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
};
