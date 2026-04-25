#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_PROXY_CONFIG_FILE,
  BLUE_GREEN_PROXY_DRAIN_MS,
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
  BLUE_GREEN_SUPPORT_SERVICES,
  clearBlueGreenRuntime,
  ensureBlueGreenRuntime,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  getBlueGreenServiceName,
  getNextBlueGreenColor,
  isBlueGreenColor,
  readBlueGreenActiveColor,
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  runBlueGreenProdWorkflow,
  testBlueGreenProxyRouting,
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
  DOCKER_STORAGE_UNZIP_PROXY_URL,
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
  ensureBuildkitBuilder,
} = require('./docker-web/buildkit-builder.js');
const {
  SKIP_WATCH_HISTORY_ENV,
  appendDeploymentHistory,
} = require('./watch-blue-green/history.js');
const { getWatchPaths } = require('./watch-blue-green/paths.js');

const ROOT_DIR = path.resolve(__dirname, '..');

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
  let buildMemory = null;
  let buildCpus = null;
  let buildMaxParallelism = null;
  let buildBuilderName = null;

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
    withSupabase,
    withRedis,
  };
}

function usesBlueGreenStrategy(parsed) {
  return parsed.mode === 'prod' && parsed.strategy === 'blue-green';
}

function getInPlaceProdServices(parsed) {
  const services = ['web'];

  if (hasComposeProfile(parsed.composeGlobalArgs, 'redis')) {
    services.push('redis', 'serverless-redis-http');
  }

  return services;
}

async function runDockerWebWorkflow(parsed, options = {}) {
  const run = options.runCommand ?? runCommand;
  const fsImpl = options.fsImpl ?? fs;
  const composeFile = getComposeFile(parsed.mode);
  const env = options.env ?? process.env;
  const withRedis = hasComposeProfile(parsed.composeGlobalArgs, 'redis');

  await runChecked('docker', ['compose', 'version'], {
    env,
    fsImpl,
    runCommand: run,
    stdio: 'ignore',
  });

  if (parsed.action === 'down') {
    const composeEnv = getComposeEnvironment({
      baseEnv: env,
      envFilePath: options.envFilePath ?? WEB_ENV_FILE,
      fsImpl,
      rootDir: options.rootDir,
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

  ensureWebEnvFile(fsImpl, options.envFilePath ?? WEB_ENV_FILE);
  ensureProductionRedisToken(parsed, env, hasComposeProfile, {
    fsImpl,
    rootDir: options.rootDir,
  });
  let composeEnv = getComposeEnvironment({
    baseEnv: env,
    envFilePath: options.envFilePath ?? WEB_ENV_FILE,
    fsImpl,
    rootDir: options.rootDir,
    withRedis,
  });
  composeEnv = await ensureBuildkitBuilder(
    {
      builderName: parsed.buildBuilderName,
      cpus: parsed.buildCpus,
      maxParallelism: parsed.buildMaxParallelism,
      memory: parsed.buildMemory,
    },
    {
      env: composeEnv,
      fsImpl,
      rootDir: options.rootDir,
      runCommand: run,
    }
  );
  ensureRequiredComposeEnvironment(composeEnv, { withRedis });

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

  if (usesBlueGreenStrategy(parsed)) {
    const deployStartedAt = Date.now();
    const latestCommit = await getCurrentGitCommitMetadata({
      env,
      runCommand: run,
    });

    try {
      await runBlueGreenProdWorkflow(parsed, {
        drainPollMs: options.drainPollMs,
        drainTimeoutMs: options.drainTimeoutMs,
        env,
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
  BLUE_GREEN_SUPPORT_SERVICES,
  COMPOSE_FILE,
  DOCKER_HOST_ALIAS,
  DOCKER_MARKITDOWN_ENDPOINT_URL,
  DOCKER_MARKITDOWN_SERVICE_URL,
  DOCKER_STORAGE_UNZIP_PROXY_URL,
  DEFAULT_BUILDER_NAME,
  PROD_COMPOSE_FILE,
  WEB_ENV_FILE,
  clearBlueGreenRuntime,
  ensureBuildkitBuilder,
  ensureBlueGreenRuntime,
  ensureProductionRedisToken,
  ensureWebEnvFile,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  getBlueGreenServiceName,
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
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  rewriteLocalhostUrl,
  runDockerWebWorkflow,
  runComposeUpWithNameConflictRecovery,
  runChecked,
  stripUnquotedInlineComment,
  testBlueGreenProxyRouting,
  usesBlueGreenStrategy,
  waitForComposeServiceHealthy,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
};
