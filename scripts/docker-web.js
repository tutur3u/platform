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
  runComposeUpWithNameConflictRecovery,
  runChecked,
  runCommand,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
} = require('./docker-web/compose.js');
const {
  DOCKER_HOST_ALIAS,
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_PRONUNCIATION_ASSESSOR_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  DOCKER_WEB_CRON_TOKEN_FILE,
  WEB_ENV_FILE,
  ensureProductionRedisToken,
  ensureRequiredComposeEnvironment,
  ensureWebEnvFile,
  getComposeEnvironment,
  parseEnvFile,
  rewriteLocalhostUrl,
  stripUnquotedInlineComment,
} = require('./docker-web/env.js');
const {
  DEFAULT_BUILDER_NAME,
  BUILDKIT_SERVICE_NAME,
  ensureBuildkitBuilder,
} = require('./docker-web/buildkit-builder.js');
const {
  SKIP_WATCH_HISTORY_ENV,
  appendDeploymentHistory,
} = require('./watch-blue-green/history.js');
const { getWatchPaths } = require('./watch-blue-green/paths.js');
const {
  WATCHER_CONTAINER_ENV,
  BLUE_GREEN_WATCHER_SERVICE,
  startBlueGreenWatcherContainer,
} = require('./watch-blue-green-deploy.js');
const {
  CANCEL_ACTIVE_BUILD_ENV,
  DEPLOYMENT_BUILD_LOCK_TOKEN_ENV,
  acquireDeploymentBuildLock,
  clearDeploymentBuildLock,
  describeActiveDeploymentConflict,
  getActiveDeploymentConflict,
} = require('./watch-blue-green/build-lock.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLOUDFLARED_SERVICE = 'cloudflared';

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

    return {
      hash: hash || null,
      shortHash: shortHash || null,
      subject: subject || null,
    };
  } catch {
    return {
      hash: null,
      shortHash: null,
      subject: null,
    };
  }
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

async function cancelActiveBlueGreenBuild({
  composeEnv,
  conflict,
  fsImpl = fs,
  latestCommit,
  now = () => Date.now(),
  paths = getWatchPaths(),
  rootDir = ROOT_DIR,
  runCommand: run = runCommand,
} = {}) {
  const canceledAt = now();
  const reason = `Canceled active deployment before manual blue/green deploy: ${describeActiveDeploymentConflict(conflict)}`;

  await run(
    'docker',
    getComposeCommandArgs(
      getComposeFile('prod'),
      ['--profile', 'redis'],
      'stop',
      '--timeout',
      '1',
      BLUE_GREEN_WATCHER_SERVICE,
      BUILDKIT_SERVICE_NAME
    ),
    {
      env: composeEnv,
      stdio: 'pipe',
    }
  );
  await run('docker', ['buildx', 'rm', DEFAULT_BUILDER_NAME], {
    env: composeEnv,
    stdio: 'pipe',
  });

  clearDeploymentBuildLock({ fsImpl, paths });
  if (fsImpl.existsSync(paths.statusFile)) {
    fsImpl.rmSync(paths.statusFile, { force: true });
  }

  appendDeploymentHistory(
    {
      buildDurationMs: Math.max(
        0,
        canceledAt - (conflict?.lock?.startedAt ?? canceledAt)
      ),
      cancellationReason: reason,
      commitHash: conflict?.lock?.commitHash ?? latestCommit?.hash ?? null,
      commitShortHash:
        conflict?.lock?.commitShortHash ?? latestCommit?.shortHash ?? null,
      commitSubject:
        conflict?.lock?.commitSubject ?? latestCommit?.subject ?? null,
      deploymentKind: conflict?.lock?.deploymentKind ?? 'manual-interrupt',
      finishedAt: canceledAt,
      rootDir,
      startedAt: conflict?.lock?.startedAt ?? canceledAt,
      status: 'canceled',
    },
    {
      fsImpl,
      paths,
    }
  );

  return reason;
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
    composeEnv,
    conflict,
    fsImpl,
    latestCommit,
    now,
    paths,
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
  const processImpl = options.processImpl ?? process;
  const now = options.now ?? (() => Date.now());
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
      envFilePath: options.envFilePath,
      fsImpl,
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

  ensureWebEnvFile(fsImpl, options.envFilePath, options.rootDir ?? ROOT_DIR);
  ensureProductionRedisToken(parsed, env, hasComposeProfile, {
    fsImpl,
    rootDir: options.rootDir,
  });
  let composeEnv = getComposeEnvironment({
    baseEnv: env,
    envFilePath: options.envFilePath,
    fsImpl,
    rootDir: options.rootDir,
    withCloudflared,
    withRedis,
  });
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
      await runChecked('bun', ['sb:start'], {
        env,
        fsImpl,
        runCommand: run,
      });
    }

    if (parsed.resetSupabase) {
      await runChecked('bun', ['sb:reset'], {
        env,
        fsImpl,
        runCommand: run,
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
    const workflowEnv = blueGreenBuildLock
      ? {
          ...env,
          [DEPLOYMENT_BUILD_LOCK_TOKEN_ENV]: blueGreenBuildLock.token,
        }
      : env;

    try {
      await runBlueGreenProdWorkflow(parsed, {
        drainPollMs: options.drainPollMs,
        drainTimeoutMs: options.drainTimeoutMs,
        env: workflowEnv,
        envFilePath: options.envFilePath,
        fsImpl,
        proxyDrainMs: options.proxyDrainMs,
        rootDir: options.rootDir,
        runCommand: run,
      });

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
        await startWatcherContainer(['--resume-if-running'], {
          env: withCloudflared
            ? {
                ...env,
                DOCKER_WEB_WITH_CLOUDFLARED: '1',
              }
            : env,
          envFilePath: options.envFilePath,
          fsImpl,
          rootDir: options.rootDir,
          runCommand: run,
        });
      }
    } catch (error) {
      if (env[SKIP_WATCH_HISTORY_ENV] !== '1') {
        const deployFinishedAt = Date.now();

        appendDeploymentHistory(
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
            paths: getWatchPaths(options.rootDir ?? ROOT_DIR),
          }
        );
      }

      throw error;
    } finally {
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
        getBlueGreenServiceName('blue'),
        getBlueGreenServiceName('green'),
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
  DOCKER_HOST_ALIAS,
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_PRONUNCIATION_ASSESSOR_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  DOCKER_WEB_CRON_TOKEN_FILE,
  DEFAULT_BUILDER_NAME,
  PROD_COMPOSE_FILE,
  WEB_ENV_FILE,
  clearBlueGreenRuntime,
  cancelActiveBlueGreenBuild,
  describeActiveDeploymentConflict,
  ensureBuildkitBuilder,
  ensureBlueGreenRuntime,
  ensureProductionRedisToken,
  ensureRequiredComposeEnvironment,
  ensureWebEnvFile,
  getBlueGreenBuildTimeoutMs,
  getBlueGreenHiveServiceName,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  getBlueGreenServiceName,
  getActiveDeploymentConflict,
  getComposeEnvironment,
  getComposeFile,
  getComposeServiceContainerId,
  getComposeServiceContainerName,
  getContainerHealthStatus,
  getInPlaceProdServices,
  getNextBlueGreenColor,
  hasComposeProfile,
  hasComposeServiceContainer,
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
  stripUnquotedInlineComment,
  testBlueGreenProxyRouting,
  testBlueGreenHiveProxyRouting,
  usesBlueGreenStrategy,
  waitForComposeServiceHealthy,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
};
