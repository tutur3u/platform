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
const BLUE_GREEN_DRAIN_STATUS_PATH = '/__platform/drain-status';
const BLUE_GREEN_DRAIN_POLL_MS = 1_000;
const BLUE_GREEN_DRAIN_TIMEOUT_MS = 5 * 60_000;
const BLUE_GREEN_PROXY_SERVICE = 'web-proxy';
const BLUE_GREEN_COLORS = ['blue', 'green'];
const BLUE_GREEN_PROXY_DRAIN_MS = 20_000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  const primaryServiceName = getBlueGreenServiceName(color);
  const backupServiceName = getBlueGreenServiceName(
    getNextBlueGreenColor(color)
  );

  return [
    'map $http_upgrade $connection_upgrade {',
    '  default upgrade;',
    "  '' close;",
    '}',
    '',
    'resolver 127.0.0.11 ipv6=off valid=5s;',
    '',
    'upstream web_upstream {',
    '  zone web_upstream 64k;',
    `  server ${primaryServiceName}:7803 resolve max_fails=1 fail_timeout=5s;`,
    `  server ${backupServiceName}:7803 backup resolve max_fails=1 fail_timeout=5s;`,
    '}',
    '',
    'server {',
    '  listen 7803;',
    '  client_header_buffer_size 16k;',
    '  keepalive_timeout 15s;',
    '  large_client_header_buffers 8 16k;',
    '',
    '  location / {',
    '    proxy_connect_timeout 3s;',
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

async function refreshBlueGreenProxyIfRunning({
  env,
  envFilePath = WEB_ENV_FILE,
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
  const activeColor = await resolveBlueGreenActiveColor(
    readBlueGreenActiveColor(paths, fsImpl),
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

  writeBlueGreenProxyConfig(activeColor, { fsImpl, paths });
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
      'http://127.0.0.1:7803/api/health'
    ),
    {
      env,
      runCommand: run,
    }
  );
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
  const proxyDrainMs = options.proxyDrainMs ?? BLUE_GREEN_PROXY_DRAIN_MS;
  const drainPollMs = options.drainPollMs ?? BLUE_GREEN_DRAIN_POLL_MS;
  const drainTimeoutMs = options.drainTimeoutMs ?? BLUE_GREEN_DRAIN_TIMEOUT_MS;
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
    await validateBlueGreenProxyConfig({
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      runCommand: run,
    });
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
    await waitForBlueGreenServiceDrain(getBlueGreenServiceName(activeColor), {
      composeFile,
      composeGlobalArgs: parsed.composeGlobalArgs,
      env,
      pollMs: drainPollMs,
      proxyDrainMs,
      runCommand: run,
      timeoutMs: drainTimeoutMs,
    });

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
  BLUE_GREEN_DRAIN_POLL_MS,
  BLUE_GREEN_DRAIN_STATUS_PATH,
  BLUE_GREEN_DRAIN_TIMEOUT_MS,
  BLUE_GREEN_PROXY_CONFIG_FILE,
  BLUE_GREEN_PROXY_DRAIN_MS,
  BLUE_GREEN_PROXY_SERVICE,
  BLUE_GREEN_RUNTIME_DIR,
  BLUE_GREEN_STATE_FILE,
  clearBlueGreenRuntime,
  ensureBlueGreenRuntime,
  getBlueGreenPaths,
  getBlueGreenProdServices,
  getBlueGreenProdServicesWithProxyOption,
  getBlueGreenServiceName,
  getBlueGreenServiceDrainStatus,
  getNextBlueGreenColor,
  isBlueGreenColor,
  readBlueGreenActiveColor,
  refreshBlueGreenProxyIfRunning,
  reloadBlueGreenProxy,
  renderBlueGreenProxyConfig,
  resolveBlueGreenActiveColor,
  runBlueGreenProdWorkflow,
  sleep,
  testBlueGreenProxyRouting,
  validateBlueGreenProxyConfig,
  waitForBlueGreenServiceDrain,
  writeBlueGreenActiveColor,
  writeBlueGreenProxyConfig,
};
