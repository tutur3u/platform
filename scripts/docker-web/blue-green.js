const fs = require('node:fs');
const path = require('node:path');

const {
  getComposeCommandArgs,
  getComposeFile,
  hasComposeProfile,
  hasComposeServiceContainer,
  removeComposeServicesIfPresent,
  runChecked,
  runCommand,
  stopComposeServicesIfPresent,
  waitForComposeServiceHealthy,
} = require('./compose.js');
const { getComposeEnvironment, WEB_ENV_FILE } = require('./env.js');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DOCKER_WEB_RUNTIME_DIR = path.join(ROOT_DIR, 'tmp', 'docker-web');
const BLUE_GREEN_RUNTIME_DIR = path.join(DOCKER_WEB_RUNTIME_DIR, 'prod');
const BLUE_GREEN_PROXY_CONFIG_FILE = path.join(
  BLUE_GREEN_RUNTIME_DIR,
  'nginx.conf'
);
const BLUE_GREEN_STATE_FILE = path.join(BLUE_GREEN_RUNTIME_DIR, 'active-color');
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const BLUE_GREEN_COLORS = ['blue', 'green'];

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
    '  client_header_buffer_size 16k;',
    '  large_client_header_buffers 8 16k;',
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
  return getBlueGreenProdServicesWithProxyOption(parsed, targetColor, true);
}

function getBlueGreenProdServicesWithProxyOption(
  parsed,
  targetColor,
  includeProxy = true
) {
  const services = [getBlueGreenServiceName(targetColor)];

  if (includeProxy) {
    services.unshift(BLUE_GREEN_PROXY_SERVICE);
  }

  if (hasComposeProfile(parsed.composeGlobalArgs, 'redis')) {
    services.push('redis', 'serverless-redis-http');
  }

  return services;
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
      'http://127.0.0.1:7803/api/health'
    ),
    {
      env,
      runCommand: run,
    }
  );
}

async function resolveBlueGreenActiveColor(
  persistedActiveColor,
  { composeFile, composeGlobalArgs = [], env, runCommand: run }
) {
  if (!persistedActiveColor) {
    return null;
  }

  return (await hasComposeServiceContainer(
    getBlueGreenServiceName(persistedActiveColor),
    {
      composeFile,
      composeGlobalArgs,
      env,
      runCommand: run,
    }
  ))
    ? persistedActiveColor
    : null;
}

async function runBlueGreenProdWorkflow(parsed, options = {}) {
  const composeFile = getComposeFile(parsed.mode);
  const env = getComposeEnvironment({
    baseEnv: options.env ?? process.env,
    envFilePath: options.envFilePath ?? WEB_ENV_FILE,
    fsImpl: options.fsImpl ?? fs,
    rootDir: options.rootDir,
    withRedis: hasComposeProfile(parsed.composeGlobalArgs, 'redis'),
  });
  const fsImpl = options.fsImpl ?? fs;
  const paths = getBlueGreenPaths(options.rootDir ?? ROOT_DIR);
  const run = options.runCommand ?? runCommand;
  const persistedActiveColor = readBlueGreenActiveColor(paths, fsImpl);
  const activeColor = await resolveBlueGreenActiveColor(persistedActiveColor, {
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env,
    runCommand: run,
  });
  const targetColor = getNextBlueGreenColor(activeColor);
  const initialProxyColor = activeColor ?? targetColor;
  const needsProxyBootstrap = !(await hasComposeServiceContainer(
    BLUE_GREEN_PROXY_SERVICE,
    {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    }
  ));

  if (needsProxyBootstrap) {
    writeBlueGreenProxyConfig(initialProxyColor, { fsImpl, paths });
  }

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
      ...getBlueGreenProdServicesWithProxyOption(
        parsed,
        targetColor,
        needsProxyBootstrap
      )
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

  if (needsProxyBootstrap) {
    await waitForComposeServiceHealthy(BLUE_GREEN_PROXY_SERVICE, {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    });
  }

  if (initialProxyColor !== targetColor) {
    writeBlueGreenProxyConfig(targetColor, { fsImpl, paths });
    await reloadBlueGreenProxy({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    });
  }

  await testBlueGreenProxyRouting({
    composeFile,
    composeGlobalArgs: parsed.composeGlobalArgs,
    env,
    runCommand: run,
  });

  writeBlueGreenActiveColor(targetColor, paths, fsImpl);

  if (activeColor && activeColor !== targetColor) {
    await stopComposeServicesIfPresent([getBlueGreenServiceName(activeColor)], {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    });
    await removeComposeServicesIfPresent(
      [getBlueGreenServiceName(activeColor)],
      {
        composeFile,
        composeGlobalArgs: parsed.composeGlobalArgs,
        env,
        runCommand: run,
      }
    );
  }
}

module.exports = {
  BLUE_GREEN_COLORS,
  BLUE_GREEN_PROXY_CONFIG_FILE,
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
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
};
