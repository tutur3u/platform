#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_PROXY_CONFIG_FILE,
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
  clearBlueGreenRuntime,
  ensureBlueGreenRuntime,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenServiceName,
  getNextBlueGreenColor,
  isBlueGreenColor,
  readBlueGreenActiveColor,
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  runBlueGreenProdWorkflow,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
} = require('./docker-web/blue-green.js');
const {
  COMPOSE_FILE,
  PROD_COMPOSE_FILE,
  getComposeCommandArgs,
  getComposeFile,
  getComposeServiceContainerId,
  getContainerHealthStatus,
  hasComposeProfile,
  hasComposeServiceContainer,
  runChecked,
  runCommand,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
} = require('./docker-web/compose.js');
const {
  DOCKER_HOST_ALIAS,
  WEB_ENV_FILE,
  ensureProductionRedisToken,
  ensureRequiredComposeEnvironment,
  ensureWebEnvFile,
  getComposeEnvironment,
  parseEnvFile,
  rewriteLocalhostUrl,
  stripUnquotedInlineComment,
} = require('./docker-web/env.js');

const ROOT_DIR = path.resolve(__dirname, '..');

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
  const composeEnv = getComposeEnvironment({
    baseEnv: env,
    envFilePath: options.envFilePath ?? WEB_ENV_FILE,
    fsImpl,
    rootDir: options.rootDir,
    withRedis,
  });
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
    await runBlueGreenProdWorkflow(parsed, {
      env,
      envFilePath: options.envFilePath,
      fsImpl,
      rootDir: options.rootDir,
      runCommand: run,
    });
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

  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      parsed.composeGlobalArgs,
      'up',
      '--build',
      '--remove-orphans',
      ...parsed.composeArgs,
      ...(parsed.mode === 'prod' ? getInPlaceProdServices(parsed) : [])
    ),
    {
      env: composeEnv,
      fsImpl,
      runCommand: run,
    }
  );
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
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
  COMPOSE_FILE,
  DOCKER_HOST_ALIAS,
  PROD_COMPOSE_FILE,
  WEB_ENV_FILE,
  clearBlueGreenRuntime,
  ensureBlueGreenRuntime,
  ensureProductionRedisToken,
  ensureWebEnvFile,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenServiceName,
  getComposeEnvironment,
  getComposeFile,
  getComposeServiceContainerId,
  getContainerHealthStatus,
  getInPlaceProdServices,
  getNextBlueGreenColor,
  hasComposeProfile,
  hasComposeServiceContainer,
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
  runChecked,
  stripUnquotedInlineComment,
  usesBlueGreenStrategy,
  waitForComposeServiceHealthy,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
};
