#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.yml');
const PROD_COMPOSE_FILE = path.join(ROOT_DIR, 'docker-compose.web.prod.yml');
const WEB_ENV_FILE = path.join(ROOT_DIR, 'apps', 'web', '.env.local');
const DOCKER_WEB_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web');
const BLUE_GREEN_RUNTIME_DIR = path.join(DOCKER_WEB_RUNTIME_DIR, 'prod');
const BLUE_GREEN_PROXY_CONFIG_FILE = path.join(
  BLUE_GREEN_RUNTIME_DIR,
  'nginx.conf'
);
const BLUE_GREEN_STATE_FILE = path.join(BLUE_GREEN_RUNTIME_DIR, 'active-color');
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const BLUE_GREEN_COLORS = ['blue', 'green'];
const LOCALHOST_HOSTS = new Set([
  '127.0.0.1',
  '0.0.0.0',
  'localhost',
  '::1',
  '[::1]',
]);
const DOCKER_HOST_ALIAS = 'host.docker.internal';
const BLUE_GREEN_HEALTH_POLL_MS = 2_000;
const BLUE_GREEN_HEALTH_TIMEOUT_MS = 180_000;

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

  return {
    action,
    composeArgs,
    composeGlobalArgs,
    mode,
    resetSupabase,
    strategy,
    withSupabase,
  };
}

function getComposeFile(mode = 'dev') {
  return mode === 'prod' ? PROD_COMPOSE_FILE : COMPOSE_FILE;
}

function hasComposeProfile(composeGlobalArgs, profileName) {
  for (let index = 0; index < composeGlobalArgs.length; index += 1) {
    if (
      composeGlobalArgs[index] === '--profile' &&
      composeGlobalArgs[index + 1] === profileName
    ) {
      return true;
    }
  }

  return false;
}

function usesBlueGreenStrategy(parsed) {
  return parsed.mode === 'prod' && parsed.strategy === 'blue-green';
}

function parseEnvFile(envFilePath, fsImpl = fs) {
  if (!fsImpl.existsSync(envFilePath)) {
    return {};
  }

  const content = fsImpl.readFileSync(envFilePath, 'utf8');
  const values = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value.replace(/^(['"])(.*)\1$/u, '$2');
  }

  return values;
}

function rewriteLocalhostUrl(rawUrl) {
  if (!rawUrl) {
    return undefined;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!LOCALHOST_HOSTS.has(parsedUrl.hostname)) {
    return rawUrl;
  }

  parsedUrl.hostname = DOCKER_HOST_ALIAS;
  return parsedUrl.toString();
}

function getComposeEnvironment({
  baseEnv = process.env,
  envFilePath = WEB_ENV_FILE,
  fsImpl = fs,
} = {}) {
  const envFile = parseEnvFile(envFilePath, fsImpl);
  const nextPublicSupabaseUrl =
    envFile.NEXT_PUBLIC_SUPABASE_URL ?? baseEnv.NEXT_PUBLIC_SUPABASE_URL;
  const dockerInternalSupabaseUrl =
    rewriteLocalhostUrl(nextPublicSupabaseUrl) ??
    `http://${DOCKER_HOST_ALIAS}:8001`;

  return {
    ...baseEnv,
    COMPOSE_DOCKER_CLI_BUILD: baseEnv.COMPOSE_DOCKER_CLI_BUILD ?? '1',
    DOCKER_INTERNAL_SUPABASE_URL: dockerInternalSupabaseUrl,
    DOCKER_BUILDKIT: baseEnv.DOCKER_BUILDKIT ?? '1',
  };
}

function ensureWebEnvFile(fsImpl = fs, envFilePath = WEB_ENV_FILE) {
  if (!fsImpl.existsSync(envFilePath)) {
    throw new Error(
      `Missing required env file: ${path.relative(ROOT_DIR, envFilePath)}`
    );
  }
}

function ensureProductionRedisToken(parsed, baseEnv = process.env) {
  if (
    parsed.mode !== 'prod' ||
    !hasComposeProfile(parsed.composeGlobalArgs, 'redis')
  ) {
    return;
  }

  if (baseEnv.SRH_TOKEN) {
    return;
  }

  throw new Error(
    'Missing required environment variable: SRH_TOKEN must be set before using the production Redis profile.'
  );
}

function getBlueGreenPaths(rootDir = ROOT_DIR) {
  const runtimeDir = path.join(rootDir, 'tmp', 'docker-web', 'prod');

  return {
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

function getNextBlueGreenColor(activeColor) {
  return activeColor === 'blue' ? 'green' : 'blue';
}

function getBlueGreenServiceName(color) {
  if (!isBlueGreenColor(color)) {
    throw new Error(`Unsupported blue/green color "${color}".`);
  }

  return `web-${color}`;
}

function renderBlueGreenProxyConfig(color) {
  const serviceName = getBlueGreenServiceName(color);

  return [
    'map $http_upgrade $connection_upgrade {',
    '  default upgrade;',
    "  '' close;",
    '}',
    '',
    'server {',
    '  listen 7803;',
    '',
    '  location / {',
    `    proxy_pass http://${serviceName}:7803;`,
    '    proxy_http_version 1.1;',
    '    proxy_set_header Host $host;',
    '    proxy_set_header X-Real-IP $remote_addr;',
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
    '    proxy_set_header X-Forwarded-Proto $scheme;',
    '    proxy_set_header Upgrade $http_upgrade;',
    '    proxy_set_header Connection $connection_upgrade;',
    '  }',
    '}',
    '',
  ].join('\n');
}

function writeBlueGreenProxyConfig(
  color,
  { fsImpl = fs, paths = getBlueGreenPaths() } = {}
) {
  ensureBlueGreenRuntime(paths, fsImpl);
  fsImpl.writeFileSync(
    paths.proxyConfigFile,
    renderBlueGreenProxyConfig(color),
    'utf8'
  );
}

function getBlueGreenProdServices(parsed, targetColor) {
  const services = [
    BLUE_GREEN_PROXY_SERVICE,
    getBlueGreenServiceName(targetColor),
  ];

  if (hasComposeProfile(parsed.composeGlobalArgs, 'redis')) {
    services.push('redis', 'serverless-redis-http');
  }

  return services;
}

function getInPlaceProdServices(parsed) {
  const services = ['web'];

  if (hasComposeProfile(parsed.composeGlobalArgs, 'redis')) {
    services.push('redis', 'serverless-redis-http');
  }

  return services;
}

function getComposeCommandArgs(composeFile, composeGlobalArgs, ...args) {
  return ['compose', '-f', composeFile, ...composeGlobalArgs, ...args];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = (options.spawnImpl ?? spawn)(command, args, {
      cwd: options.cwd ?? ROOT_DIR,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code: code ?? 1,
        signal: signal ?? null,
        stderr,
        stdout,
      });
    });
  });
}

async function runChecked(command, args, options = {}) {
  let result;

  try {
    result = await (options.runCommand ?? runCommand)(command, args, options);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error(`Missing required executable: ${command}`);
    }

    throw error;
  }

  if (result.code !== 0) {
    const failedCommand = [command, ...args].join(' ');
    const detail = result.stderr?.trim() || result.stdout?.trim();
    const error = new Error(
      detail
        ? `Command failed (${result.code}): ${failedCommand}\n${detail}`
        : `Command failed (${result.code}): ${failedCommand}`
    );
    error.exitCode = result.code;
    throw error;
  }

  return result;
}

async function getComposeServiceContainerId(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const result = await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      composeGlobalArgs,
      'ps',
      '-q',
      serviceName
    ),
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return result.stdout.trim();
}

async function hasComposeServiceContainer(
  serviceName,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  const containerId = await getComposeServiceContainerId(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  return containerId.length > 0;
}

async function stopComposeServicesIfPresent(
  serviceNames,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  for (const serviceName of serviceNames) {
    if (
      !(await hasComposeServiceContainer(serviceName, {
        composeFile,
        composeGlobalArgs,
        env,
        runCommand: run,
      }))
    ) {
      continue;
    }

    await runChecked(
      'docker',
      getComposeCommandArgs(
        composeFile,
        composeGlobalArgs,
        'stop',
        serviceName
      ),
      {
        env,
        runCommand: run,
      }
    );
  }
}

async function getContainerHealthStatus(containerId, { env, runCommand: run }) {
  const result = await runChecked(
    'docker',
    [
      'inspect',
      '-f',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      containerId,
    ],
    {
      env,
      runCommand: run,
      stdio: 'pipe',
    }
  );

  return result.stdout.trim();
}

async function waitForComposeServiceHealthy(
  serviceName,
  {
    composeFile,
    composeGlobalArgs = [],
    env,
    pollMs = BLUE_GREEN_HEALTH_POLL_MS,
    runCommand: run,
    timeoutMs = BLUE_GREEN_HEALTH_TIMEOUT_MS,
  }
) {
  const containerId = await getComposeServiceContainerId(serviceName, {
    composeFile,
    composeGlobalArgs,
    env,
    runCommand: run,
  });

  if (!containerId) {
    throw new Error(`Unable to resolve a container for ${serviceName}.`);
  }

  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'unknown';

  while (Date.now() <= deadline) {
    lastStatus = await getContainerHealthStatus(containerId, {
      env,
      runCommand: run,
    });

    if (lastStatus === 'healthy') {
      return;
    }

    if (lastStatus === 'dead' || lastStatus === 'exited') {
      throw new Error(
        `${serviceName} failed before becoming healthy (status: ${lastStatus}).`
      );
    }

    await sleep(pollMs);
  }

  throw new Error(
    `${serviceName} did not become healthy within ${timeoutMs}ms (last status: ${lastStatus}).`
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

async function runBlueGreenProdWorkflow(parsed, options = {}) {
  const composeFile = getComposeFile(parsed.mode);
  const env = getComposeEnvironment({
    baseEnv: options.env ?? process.env,
    envFilePath: options.envFilePath ?? WEB_ENV_FILE,
    fsImpl: options.fsImpl ?? fs,
  });
  const fsImpl = options.fsImpl ?? fs;
  const paths = getBlueGreenPaths(options.rootDir ?? ROOT_DIR);
  const run = options.runCommand ?? runCommand;
  const activeColor = readBlueGreenActiveColor(paths, fsImpl);
  const targetColor = getNextBlueGreenColor(activeColor);
  const initialProxyColor = activeColor ?? targetColor;

  writeBlueGreenProxyConfig(initialProxyColor, { fsImpl, paths });

  await stopComposeServicesIfPresent(['web'], {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env,
    runCommand: run,
  });

  await runChecked(
    'docker',
    getComposeCommandArgs(
      composeFile,
      parsed.composeGlobalArgs,
      'up',
      '--build',
      '--detach',
      '--remove-orphans',
      ...parsed.composeArgs,
      ...getBlueGreenProdServices(parsed, targetColor)
    ),
    {
      env,
      fsImpl,
      runCommand: run,
    }
  );

  await waitForComposeServiceHealthy(getBlueGreenServiceName(targetColor), {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env,
    runCommand: run,
  });

  if (initialProxyColor !== targetColor) {
    writeBlueGreenProxyConfig(targetColor, { fsImpl, paths });
    await reloadBlueGreenProxy({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    });
  }

  writeBlueGreenActiveColor(targetColor, paths, fsImpl);

  if (activeColor && activeColor !== targetColor) {
    await stopComposeServicesIfPresent([getBlueGreenServiceName(activeColor)], {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    });
  }
}

async function runDockerWebWorkflow(parsed, options = {}) {
  const run = options.runCommand ?? runCommand;
  const fsImpl = options.fsImpl ?? fs;
  const composeFile = getComposeFile(parsed.mode);
  const env = options.env ?? process.env;

  await runChecked('docker', ['compose', 'version'], {
    env,
    fsImpl,
    runCommand: run,
    stdio: 'ignore',
  });

  if (parsed.action === 'down') {
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
        env: getComposeEnvironment({
          baseEnv: env,
          envFilePath: options.envFilePath ?? WEB_ENV_FILE,
          fsImpl,
        }),
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
  ensureProductionRedisToken(parsed, env);

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
        env: getComposeEnvironment({
          baseEnv: env,
          envFilePath: options.envFilePath ?? WEB_ENV_FILE,
          fsImpl,
        }),
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
      env: getComposeEnvironment({
        baseEnv: env,
        envFilePath: options.envFilePath ?? WEB_ENV_FILE,
        fsImpl,
      }),
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
  getInPlaceProdServices,
  getNextBlueGreenColor,
  hasComposeProfile,
  isBlueGreenColor,
  main,
  parseArgs,
  parseEnvFile,
  readBlueGreenActiveColor,
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  rewriteLocalhostUrl,
  runDockerWebWorkflow,
  runChecked,
  usesBlueGreenStrategy,
  waitForComposeServiceHealthy,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
};
