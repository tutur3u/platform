const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PORT_CHECK_TIMEOUT_MS = 250;
const PORTLESS_DEV_SCRIPT = 'node ../../scripts/portless-safe-dev.js';
const PORTLESS_HOST_SUFFIX = '.localhost';
const PORTLESS_SUBCOMMANDS = new Set([
  'alias',
  'clean',
  'get',
  'hosts',
  'list',
  'proxy',
  'prune',
  'run',
  'service',
  'trust',
]);

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function parseDefaultPort(devAppScript) {
  if (typeof devAppScript !== 'string') {
    return null;
  }

  const match =
    devAppScript.match(/(?:^|\s)-p\s+\$\{PORT:-(\d+)\}/u) ??
    devAppScript.match(/(?:^|\s)-p\s+(\d+)/u);
  const parsed = match?.[1] ? Number.parseInt(match[1], 10) : null;

  return parsed && Number.isFinite(parsed) ? parsed : null;
}

function resolvePortlessBin(rootDir = ROOT_DIR, platform = process.platform) {
  const executable = platform === 'win32' ? 'portless.cmd' : 'portless';
  const localBin = path.join(rootDir, 'node_modules', '.bin', executable);

  return fs.existsSync(localBin) ? localBin : 'portless';
}

function toPosixRelativePath(rootDir, targetPath) {
  return path.relative(rootDir, targetPath).replace(/\\/g, '/');
}

function loadPortlessConfig({ fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const configPath = path.join(rootDir, 'portless.json');

  return fsImpl.existsSync(configPath) ? readJson(configPath, fsImpl) : {};
}

function getKnownPortlessHosts({ fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const config = loadPortlessConfig({ fsImpl, rootDir });
  const names = Object.values(config.apps ?? {})
    .map((appConfig) => appConfig?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);

  return new Set(names.map(getPortlessHost));
}

function resolveCurrentAppConfig({
  cwd = process.cwd(),
  fsImpl = fs,
  rootDir = ROOT_DIR,
} = {}) {
  const appDir = path.resolve(cwd);
  const packageJsonPath = path.join(appDir, 'package.json');

  if (!fsImpl.existsSync(packageJsonPath)) {
    return null;
  }

  const relativePath = toPosixRelativePath(rootDir, appDir);
  const rootConfig = loadPortlessConfig({ fsImpl, rootDir });
  const rootAppConfig = rootConfig.apps?.[relativePath];
  const pkg = readJson(packageJsonPath, fsImpl);
  const packageAppConfig =
    typeof pkg.portless === 'string' ? { name: pkg.portless } : pkg.portless;
  const appConfig = {
    ...(rootAppConfig ?? {}),
    ...(packageAppConfig ?? {}),
  };
  const routeName = appConfig.name;

  if (typeof routeName !== 'string' || routeName.length === 0) {
    return null;
  }

  const scriptName =
    typeof appConfig.script === 'string' && appConfig.script.length > 0
      ? appConfig.script
      : 'dev';

  return {
    defaultPort: parseDefaultPort(pkg.scripts?.[scriptName]),
    packageName: pkg.name,
    path: relativePath,
    routeName,
    scriptName,
  };
}

function getPortlessHost(routeName) {
  return `${routeName}${PORTLESS_HOST_SUFFIX}`;
}

function getPortlessAliasNameFromHost(host) {
  return host.endsWith(PORTLESS_HOST_SUFFIX)
    ? host.slice(0, -PORTLESS_HOST_SUFFIX.length)
    : host;
}

function parsePortlessListOutput(output = '') {
  const routes = [];
  const routePattern =
    /^\s*(?:https?:\/\/)?([A-Za-z0-9.-]+)(?::\d+)?\s+->\s+(?:https?:\/\/)?(?:localhost|127\.0\.0\.1):(\d+)(?:\s|$)/u;

  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(routePattern);

    if (!match) {
      continue;
    }

    routes.push({
      host: match[1],
      isAlias: /\(alias\)/u.test(line),
      line,
      port: Number.parseInt(match[2], 10),
    });
  }

  return routes;
}

function isSameAppPortlessHost(routeHost, appHost, { knownHosts = new Set() }) {
  if (routeHost === appHost) {
    return true;
  }

  if (knownHosts.has(routeHost) || !routeHost.endsWith(`.${appHost}`)) {
    return false;
  }

  return routeHost.split('.').length === appHost.split('.').length + 1;
}

function getPortlessRoutesForApp(app, portlessListOutput = '', options = {}) {
  const appHost = getPortlessHost(app.routeName);
  const ignoredHosts = options.ignoredHosts ?? new Set();

  return parsePortlessListOutput(portlessListOutput).filter(
    (route) =>
      !ignoredHosts.has(route.host) &&
      isSameAppPortlessHost(route.host, appHost, options)
  );
}

function isTcpPortOpen(
  port,
  { host = '127.0.0.1', timeoutMs = DEFAULT_PORT_CHECK_TIMEOUT_MS } = {}
) {
  if (!port) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (isOpen) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(isOpen);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

function runPortlessCommand(
  runner,
  args,
  {
    command = 'bunx',
    commandArgsPrefix = ['portless'],
    env = process.env,
    rootDir = ROOT_DIR,
  } = {}
) {
  return runner(command, [...commandArgsPrefix, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env,
    timeout: 5000,
  });
}

function getCommandOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function getPortlessListOutput({
  command,
  commandArgsPrefix,
  env = process.env,
  rootDir = ROOT_DIR,
  runner = spawnSync,
} = {}) {
  const result = runPortlessCommand(runner, ['list'], {
    command,
    commandArgsPrefix,
    env,
    rootDir,
  });

  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

async function removeClosedSameAppAliases(
  app,
  {
    checkPort = isTcpPortOpen,
    command,
    commandArgsPrefix,
    env = process.env,
    knownHosts = new Set(),
    portlessListOutput = '',
    rootDir = ROOT_DIR,
    runner = spawnSync,
  } = {}
) {
  if (!app?.defaultPort) {
    return [];
  }

  const results = [];
  const routes = getPortlessRoutesForApp(app, portlessListOutput, {
    knownHosts,
  });

  for (const route of routes) {
    if (!route.isAlias || route.port !== app.defaultPort) {
      continue;
    }

    if (await checkPort(route.port, app)) {
      continue;
    }

    const aliasName = getPortlessAliasNameFromHost(route.host);
    const result = runPortlessCommand(
      runner,
      ['alias', '--remove', aliasName],
      {
        command,
        commandArgsPrefix,
        env,
        rootDir,
      }
    );

    results.push({
      aliasName,
      host: route.host,
      ok: result.status === 0,
      output: getCommandOutput(result),
      port: route.port,
    });
  }

  return results;
}

function shouldDelegateThroughPortlessRun(args = []) {
  if (!args.includes('--force')) {
    return false;
  }

  const firstArg = args[0];

  return (
    !firstArg ||
    firstArg === '--' ||
    firstArg.startsWith('-') ||
    !PORTLESS_SUBCOMMANDS.has(firstArg)
  );
}

function getDelegatedPortlessArgs(args = [], app = null) {
  if (!app?.routeName || !shouldDelegateThroughPortlessRun(args)) {
    return args;
  }

  return ['run', '--name', app.routeName, ...args];
}

async function runPortlessSafeDev({
  args = process.argv.slice(2),
  checkPort = isTcpPortOpen,
  cwd = process.cwd(),
  env = process.env,
  fsImpl = fs,
  rootDir = ROOT_DIR,
  runner = spawnSync,
  spawnImpl = spawn,
  stderr = process.stderr,
  stdin = process.stdin,
  stdout = process.stdout,
} = {}) {
  const app = resolveCurrentAppConfig({ cwd, fsImpl, rootDir });
  const portlessBin = resolvePortlessBin(rootDir);
  const cleanupCommand = portlessBin;
  const cleanupCommandArgsPrefix = [];
  const knownHosts = getKnownPortlessHosts({ fsImpl, rootDir });
  let cleanupResults = [];

  if (app) {
    const portlessListOutput = getPortlessListOutput({
      command: cleanupCommand,
      commandArgsPrefix: cleanupCommandArgsPrefix,
      env,
      rootDir,
      runner,
    });

    cleanupResults = await removeClosedSameAppAliases(app, {
      checkPort,
      command: cleanupCommand,
      commandArgsPrefix: cleanupCommandArgsPrefix,
      env,
      knownHosts,
      portlessListOutput,
      rootDir,
      runner,
    });

    for (const cleanup of cleanupResults) {
      if (cleanup.ok) {
        stdout.write(
          `Removed stale Portless alias ${cleanup.host} -> localhost:${cleanup.port}.\n`
        );
      } else {
        stderr.write(
          `Could not remove stale Portless alias ${cleanup.host}; continuing. ${cleanup.output}\n`
        );
      }
    }
  }

  const delegatedArgs = getDelegatedPortlessArgs(args, app);
  const child = spawnImpl(portlessBin, delegatedArgs, {
    cwd,
    env,
    stdio: [stdin, 'inherit', 'inherit'],
  });

  const forwardSignal = (signal) => {
    child.kill(signal);
  };

  process.once('SIGINT', forwardSignal);
  process.once('SIGTERM', forwardSignal);

  child.on('exit', (code, signal) => {
    process.removeListener('SIGINT', forwardSignal);
    process.removeListener('SIGTERM', forwardSignal);

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode = code ?? 1;
  });

  child.on('error', (error) => {
    process.removeListener('SIGINT', forwardSignal);
    process.removeListener('SIGTERM', forwardSignal);
    stderr.write(`Failed to start Portless: ${error.message}\n`);
    process.exitCode = 1;
  });

  return {
    app,
    cleanupResults,
    command: portlessBin,
    delegatedArgs,
  };
}

if (require.main === module) {
  runPortlessSafeDev().catch((error) => {
    process.stderr.write(
      `Failed to prepare Portless dev startup: ${error.message}\n`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  PORTLESS_DEV_SCRIPT,
  getDelegatedPortlessArgs,
  getKnownPortlessHosts,
  getPortlessAliasNameFromHost,
  getPortlessHost,
  getPortlessListOutput,
  getPortlessRoutesForApp,
  isSameAppPortlessHost,
  isTcpPortOpen,
  parseDefaultPort,
  parsePortlessListOutput,
  removeClosedSameAppAliases,
  resolveCurrentAppConfig,
  resolvePortlessBin,
  runPortlessSafeDev,
  shouldDelegateThroughPortlessRun,
};
