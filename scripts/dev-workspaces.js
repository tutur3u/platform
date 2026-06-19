const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { runPortlessSetup } = require('./setup-portless');
const {
  getPortlessRoutesForApp,
  removeClosedSameAppAliases,
} = require('./portless-safe-dev');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PORT_CHECK_TIMEOUT_MS = 250;
const PORTLESS_ROUTE_LOCK_PATTERN = /Failed to acquire route lock/u;
const PORTLESS_ROUTE_LOCK_RETRY_DELAY_MS = 11_000;
const PORTLESS_ROUTE_LOCK_EXIT_TIMEOUT_MS = 1500;

const DEV_TARGETS = Object.freeze({
  apps: {
    apps: ['apps'],
    shared: ['@tuturuuu/types'],
  },
  calendar: {
    apps: ['calendar', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  chat: {
    apps: ['chat', 'web'],
    services: ['chat-realtime'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase', '@tuturuuu/internal-api'],
  },
  cms: {
    apps: ['cms', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  drive: {
    apps: ['drive', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase', '@tuturuuu/internal-api'],
  },
  edu: {
    apps: ['learn', 'teach', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  external: {
    apps: ['external'],
    shared: [],
  },
  finance: {
    apps: ['finance', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  infra: {
    apps: ['infra', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/internal-api'],
  },
  hive: {
    apps: ['hive-realtime', 'hive', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  inventory: {
    apps: ['inventory', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase', '@tuturuuu/internal-api'],
  },
  storefront: {
    apps: ['storefront', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase', '@tuturuuu/internal-api'],
  },
  learn: {
    apps: ['learn', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  mail: {
    apps: ['mail', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase', '@tuturuuu/internal-api'],
  },
  meet: {
    apps: ['meet', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  mind: {
    apps: ['mind', 'web'],
    shared: [
      '@tuturuuu/types',
      '@tuturuuu/supabase',
      '@tuturuuu/internal-api',
      '@tuturuuu/ai',
    ],
  },
  nova: {
    apps: ['nova', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  qr: {
    apps: ['qr'],
    shared: ['@tuturuuu/types'],
  },
  rewise: {
    apps: ['rewise', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  shortener: {
    apps: ['shortener', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  tasks: {
    apps: ['tasks', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  teach: {
    apps: ['teach', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  track: {
    apps: ['track', 'web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
  web: {
    apps: ['web'],
    shared: ['@tuturuuu/types', '@tuturuuu/supabase'],
  },
});

const DEV_SERVICES = Object.freeze({
  'chat-realtime': {
    args: ['--watch', 'apps/chat-realtime/src/index.ts'],
    command: 'bun',
    env: { PORT: '7817' },
    envFiles: ['apps/web/.env.local', '.env.local'],
    label: 'chat realtime',
    port: 7817,
  },
});

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function unique(values) {
  return [...new Set(values)];
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

function getAppKeyFromPath(relativePath) {
  return relativePath.replace(/^apps\//u, '');
}

function loadAppCatalog({ fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const config = readJson(path.join(rootDir, 'portless.json'), fsImpl);
  const catalog = {};

  for (const [relativePath, appConfig] of Object.entries(config.apps ?? {})) {
    const packageJsonPath = path.join(rootDir, relativePath, 'package.json');
    const pkg = readJson(packageJsonPath, fsImpl);
    const appKey = getAppKeyFromPath(relativePath);

    catalog[appKey] = {
      defaultPort: parseDefaultPort(pkg.scripts?.['dev:app']),
      packageName: pkg.name,
      path: relativePath,
      routeName: appConfig.name,
    };
  }

  return catalog;
}

function getPortlessHost(routeName) {
  return `${routeName}.localhost`;
}

function getActivePortlessRouteHost(
  app,
  portlessListOutput = '',
  { knownHosts = new Set() } = {}
) {
  return getActivePortlessRoute(app, portlessListOutput, { knownHosts })?.host;
}

function getActivePortlessRoute(
  app,
  portlessListOutput = '',
  { ignoredHosts = new Set(), knownHosts = new Set() } = {}
) {
  return (
    getPortlessRoutesForApp(app, portlessListOutput, {
      ignoredHosts,
      knownHosts,
    })[0] ?? null
  );
}

function isPortlessRouteActive(app, portlessListOutput = '', options = {}) {
  return Boolean(getActivePortlessRouteHost(app, portlessListOutput, options));
}

function getPortlessListOutput({
  env = process.env,
  rootDir = ROOT_DIR,
  runner = spawnSync,
} = {}) {
  const result = runner('bunx', ['portless', 'list'], {
    cwd: rootDir,
    encoding: 'utf8',
    env,
    timeout: 5000,
  });

  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

function getPortlessExpectedUrl(
  app,
  { rootDir = ROOT_DIR, runner = spawnSync } = {}
) {
  const result = runner('bunx', ['portless', 'get', app.routeName], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 5000,
  });
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join('\n')
    .trim();

  if (result.status !== 0 || !output) {
    return `https://${getPortlessHost(app.routeName)}`;
  }

  try {
    return new URL(output).origin;
  } catch {
    return `https://${getPortlessHost(app.routeName)}`;
  }
}

function getPortlessAliasName(app, expectedUrl) {
  try {
    const hostname = new URL(expectedUrl).hostname;

    return hostname.endsWith('.localhost')
      ? hostname.slice(0, -'.localhost'.length)
      : hostname;
  } catch {
    return app.routeName;
  }
}

function registerPortlessAlias(
  app,
  { expectedUrl, rootDir = ROOT_DIR, runner = spawnSync } = {}
) {
  if (!app.defaultPort) {
    return {
      ok: false,
      output: 'No default port is configured for this app.',
    };
  }

  const aliasName = getPortlessAliasName(app, expectedUrl);
  const result = runner(
    'bunx',
    ['portless', 'alias', aliasName, String(app.defaultPort)],
    {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 5000,
    }
  );

  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
}

function removePortlessAlias(
  app,
  { expectedUrl, rootDir = ROOT_DIR, runner = spawnSync } = {}
) {
  const aliasName = getPortlessAliasName(app, expectedUrl);
  const result = runner('bunx', ['portless', 'alias', '--remove', aliasName], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 5000,
  });

  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
  };
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

async function resolveAppStates(
  appKeys,
  {
    aliasRunner = spawnSync,
    catalog,
    checkPort = isTcpPortOpen,
    forceStart = false,
    portlessListOutput = '',
    registerAliases = true,
    resolvePortlessUrl = getPortlessExpectedUrl,
    rootDir = ROOT_DIR,
  } = {}
) {
  const states = {};
  const knownHosts = new Set(
    Object.values(catalog).map((app) => getPortlessHost(app.routeName))
  );

  for (const appKey of unique(appKeys)) {
    const app = catalog[appKey];

    if (!app) {
      throw new Error(`Unknown app target: ${appKey}`);
    }

    const expectedPortlessUrl = resolvePortlessUrl(app, { rootDir });
    const aliasCleanup =
      registerAliases && app.defaultPort
        ? await removeClosedSameAppAliases(app, {
            checkPort,
            knownHosts,
            portlessListOutput,
            rootDir,
            runner: aliasRunner,
          })
        : [];
    const ignoredHosts = new Set(
      aliasCleanup
        .filter((cleanup) => cleanup.ok)
        .map((cleanup) => cleanup.host)
    );

    if (forceStart) {
      states[appKey] = {
        aliasCleanup,
        reason: 'forced',
        status: 'missing',
        url: expectedPortlessUrl,
      };
      continue;
    }

    const activePortlessRoute = getActivePortlessRoute(
      app,
      portlessListOutput,
      {
        ignoredHosts,
        knownHosts,
      }
    );

    if (
      activePortlessRoute &&
      (!activePortlessRoute.port ||
        (await checkPort(activePortlessRoute.port, app)))
    ) {
      states[appKey] = {
        aliasCleanup,
        reason: 'portless',
        status: 'active',
        url: `https://${activePortlessRoute.host}`,
      };
      continue;
    }

    if (app.defaultPort && (await checkPort(app.defaultPort, app))) {
      const alias = registerAliases
        ? registerPortlessAlias(app, {
            expectedUrl: expectedPortlessUrl,
            rootDir,
            runner: aliasRunner,
          })
        : { ok: false, output: 'Portless alias registration disabled.' };

      states[appKey] = {
        alias,
        aliasCleanup,
        reason: 'localhost',
        status: 'active',
        url: alias.ok
          ? expectedPortlessUrl
          : `http://localhost:${app.defaultPort}`,
      };
      continue;
    }

    const pendingAlias =
      registerAliases && app.defaultPort
        ? registerPortlessAlias(app, {
            expectedUrl: expectedPortlessUrl,
            rootDir,
            runner: aliasRunner,
          })
        : null;
    const staleAlias =
      registerAliases && !pendingAlias
        ? removePortlessAlias(app, {
            expectedUrl: expectedPortlessUrl,
            rootDir,
            runner: aliasRunner,
          })
        : null;

    states[appKey] = {
      aliasCleanup,
      alias: pendingAlias,
      reason: 'not-running',
      staleAlias,
      status: 'missing',
      url: expectedPortlessUrl,
    };
  }

  return states;
}

async function resolveServiceStates(
  serviceKeys,
  { checkPort = isTcpPortOpen, serviceCatalog = DEV_SERVICES } = {}
) {
  const states = {};

  for (const serviceKey of unique(serviceKeys)) {
    const service = serviceCatalog[serviceKey];

    if (!service) {
      throw new Error(`Unknown dev service: ${serviceKey}`);
    }

    states[serviceKey] = (await checkPort(service.port, service))
      ? {
          port: service.port,
          reason: 'localhost',
          status: 'active',
        }
      : {
          port: service.port,
          reason: 'not-running',
          status: 'missing',
        };
  }

  return states;
}

function getAppStateUrl(appKey, appStates) {
  const url = appStates[appKey]?.url;

  return typeof url === 'string' && url ? url : null;
}

function getAppCommandEnv({ appKey, appStates, webUrl }) {
  const appUrl = getAppStateUrl(appKey, appStates);
  const env = {};

  if (appUrl) {
    env.PORTLESS_URL = appUrl;
  }

  if (appKey !== 'web' && webUrl) {
    env.INTERNAL_WEB_API_ORIGIN = webUrl;
    env.NEXT_PUBLIC_WEB_APP_URL = webUrl;
    env.WEB_APP_URL = webUrl;
  }

  return Object.keys(env).length > 0 ? env : undefined;
}

function getPortlessCaCertPath({
  env = process.env,
  fsImpl = fs,
  homeDir = os.homedir(),
} = {}) {
  const stateDir = env.PORTLESS_STATE_DIR || path.join(homeDir, '.portless');
  const caCertPath = path.join(stateDir, 'ca.pem');

  return fsImpl.existsSync(caCertPath) ? caCertPath : null;
}

function getDirectAppCommandEnv(app, { portlessCaCertPath = null } = {}) {
  if (!app.defaultPort) {
    return {};
  }

  const env = {
    HOST: '127.0.0.1',
    PORT: String(app.defaultPort),
  };

  if (portlessCaCertPath) {
    env.NODE_EXTRA_CA_CERTS = portlessCaCertPath;
  }

  return env;
}

function parseEnvFileContent(content) {
  const values = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(
      /^(?:export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/u
    );
    if (!match) {
      continue;
    }

    let value = match[2].trim();
    const quote = value[0];

    if (
      (quote === '"' || quote === "'") &&
      value.endsWith(quote) &&
      value.length >= 2
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/u, '').trim();
    }

    values[match[1]] = value;
  }

  return values;
}

function loadEnvFiles(envFiles = [], { fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const values = {};

  for (const envFile of envFiles) {
    const envPath = path.join(rootDir, envFile);

    if (!fsImpl.existsSync(envPath)) {
      continue;
    }

    Object.assign(
      values,
      parseEnvFileContent(fsImpl.readFileSync(envPath, 'utf8'))
    );
  }

  return values;
}

function getServiceCommandEnv(
  service,
  { env = process.env, rootDir = ROOT_DIR } = {}
) {
  const envFileValues = loadEnvFiles(service.envFiles, { rootDir });
  const resolved = { ...envFileValues, ...(service.env ?? {}) };

  for (const key of Object.keys(envFileValues)) {
    if (env[key]) {
      resolved[key] = env[key];
    }
  }

  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function createDevPlan(
  targetName,
  {
    appStates,
    catalog,
    env = process.env,
    forceStart = false,
    includeSharedWatchers = true,
    portlessCaCertPath = null,
    rootDir = ROOT_DIR,
    serviceCatalog = DEV_SERVICES,
    serviceStates = null,
    turboArgs = [],
  } = {}
) {
  const target = DEV_TARGETS[targetName];

  if (!target) {
    throw new Error(`Unknown dev target: ${targetName}`);
  }

  const requestedAppKeys = unique(target.apps);
  const requestedServiceKeys = serviceStates
    ? unique(target.services ?? [])
    : [];
  const missingAppKeys = requestedAppKeys.filter(
    (appKey) => appStates[appKey]?.status !== 'active'
  );
  const missingServiceKeys = requestedServiceKeys.filter(
    (serviceKey) => serviceStates[serviceKey]?.status !== 'active'
  );
  const skippedAppKeys = requestedAppKeys.filter(
    (appKey) => appStates[appKey]?.status === 'active'
  );
  const skippedServiceKeys = requestedServiceKeys.filter(
    (serviceKey) => serviceStates[serviceKey]?.status === 'active'
  );

  if (
    requestedAppKeys.length > 0 &&
    missingAppKeys.length === 0 &&
    missingServiceKeys.length === 0
  ) {
    return {
      appCommands: [],
      commands: [],
      serviceCommands: [],
      sharedCommand: null,
      missingAppKeys,
      missingServiceKeys,
      skippedAppKeys,
      skippedServiceKeys,
    };
  }

  const targetSharedFilters = unique(target.shared).filter(Boolean);
  const sharedFilters = includeSharedWatchers ? targetSharedFilters : [];
  const sharedCommand =
    missingAppKeys.length > 0 && sharedFilters.length > 0
      ? {
          args: [
            'turbo:local',
            'run',
            'dev',
            ...sharedFilters.flatMap((filter) => ['-F', filter]),
            ...turboArgs,
          ],
          command: 'bun',
          label: 'shared package watchers',
        }
      : null;
  const webUrl = requestedAppKeys.includes('web')
    ? getAppStateUrl('web', appStates)
    : null;
  const appCommands = missingAppKeys.map((appKey) => {
    const app = catalog[appKey];
    const directAppEnv = getDirectAppCommandEnv(app, { portlessCaCertPath });
    const appEnv = {
      ...directAppEnv,
      ...(getAppCommandEnv({
        appKey,
        appStates,
        webUrl,
      }) ?? {}),
    };

    return {
      appKey,
      args: forceStart
        ? ['run', 'dev', '--force']
        : app.defaultPort
          ? ['run', 'dev:app']
          : ['run', 'dev'],
      command: 'bun',
      cwd: app.path,
      env: Object.keys(appEnv).length > 0 ? appEnv : undefined,
      label: appKey,
    };
  });
  const serviceCommands = missingServiceKeys.map((serviceKey) => {
    const service = serviceCatalog[serviceKey];

    return {
      args: service.args,
      command: service.command,
      cwd: service.cwd,
      env: getServiceCommandEnv(service, { env, rootDir }),
      label: service.label,
      serviceKey,
    };
  });
  const commands = [sharedCommand, ...serviceCommands, ...appCommands].filter(
    Boolean
  );

  return {
    appCommands,
    commands,
    serviceCommands,
    sharedCommand,
    sharedFilters,
    skippedSharedFilters:
      missingAppKeys.length > 0 && !includeSharedWatchers
        ? targetSharedFilters
        : [],
    missingAppKeys,
    missingServiceKeys,
    skippedAppKeys,
    skippedServiceKeys,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const [targetName, ...rest] = argv;
  let includeSharedWatchers = null;
  const turboArgs = [];
  let dryRun = false;
  let forceStart = false;

  for (const arg of rest) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--with-shared-watchers') {
      includeSharedWatchers = true;
      continue;
    }

    if (arg === '--no-shared-watchers') {
      includeSharedWatchers = false;
      continue;
    }

    if (arg === '--force' || arg === '--no-reuse') {
      forceStart = true;
      continue;
    }

    turboArgs.push(arg);
  }

  return {
    dryRun,
    forceStart,
    includeSharedWatchers,
    targetName,
    turboArgs,
  };
}

function formatSkippedApps(skippedAppKeys, appStates) {
  return skippedAppKeys
    .map((appKey) => {
      const state = appStates[appKey];
      const url = state?.url;

      return url ? `${appKey} (${url})` : appKey;
    })
    .join(', ');
}

function formatSkippedServices(skippedServiceKeys, serviceStates) {
  return skippedServiceKeys
    .map((serviceKey) => {
      const state = serviceStates[serviceKey];

      return state?.port
        ? `${serviceKey} (localhost:${state.port})`
        : serviceKey;
    })
    .join(', ');
}

function formatDevCommand(command) {
  const cwd = command.cwd ? ` (cwd: ${command.cwd})` : '';

  return `${command.label}: ${command.command} ${command.args.join(' ')}${cwd}`;
}

function formatAliasCleanupWarnings(appStates) {
  const warnings = [];

  for (const [appKey, state] of Object.entries(appStates)) {
    for (const cleanup of state.aliasCleanup ?? []) {
      if (cleanup.ok) {
        continue;
      }

      warnings.push(
        `Could not remove stale Portless alias for ${appKey} (${cleanup.host}); continuing. ${cleanup.output}`
      );
    }
  }

  return warnings;
}

function waitForOutputPattern({ child, patterns = [], timeoutMs = 8000 } = {}) {
  if (patterns.length === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
      child.off('exit', finish);
      resolve();
    };
    const onData = (data) => {
      const chunk = data.toString();

      if (patterns.some((pattern) => pattern.test(chunk))) {
        finish();
      }
    };
    const timeout = setTimeout(finish, timeoutMs);

    timeout.unref?.();
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', finish);
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);

    timeout.unref?.();
  });
}

function waitForChildExitOrTimeout(exitPromise, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);

    timeout.unref?.();
    exitPromise.then(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function spawnDevCommands({
  commands,
  env = process.env,
  routeLockExitTimeoutMs = PORTLESS_ROUTE_LOCK_EXIT_TIMEOUT_MS,
  routeLockRetryDelayMs = PORTLESS_ROUTE_LOCK_RETRY_DELAY_MS,
  rootDir = ROOT_DIR,
  spawnImpl = spawn,
  stderr = process.stderr,
  stdout = process.stdout,
} = {}) {
  const children = [];
  let shuttingDown = false;
  let resolveExit;
  const exitPromise = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const getRunningChildren = (ignoredChild) =>
    children.filter(
      (runningChild) =>
        runningChild !== ignoredChild &&
        !runningChild.killed &&
        runningChild.exitCode === null
    );
  const stopChild = (child, signal) => {
    if (
      !child.pid ||
      child.killed ||
      child.exitCode !== null ||
      child.signalCode !== null
    ) {
      return;
    }

    try {
      if (process.platform !== 'win32') {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch {
      try {
        child.kill(signal);
      } catch {}
    }
  };
  const stopChildren = (signal = 'SIGTERM') => {
    shuttingDown = true;

    for (const child of children) {
      stopChild(child, signal);
    }
  };
  const handleSignal = (signal) => {
    stopChildren(signal);
    resolveExit(signal === 'SIGINT' ? 130 : 143);
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  for (const command of commands) {
    if (shuttingDown) {
      break;
    }

    const maxAttempts = command.appKey ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (shuttingDown) {
        break;
      }

      const child = spawnImpl(command.command, command.args, {
        cwd: command.cwd ? path.join(rootDir, command.cwd) : rootDir,
        detached: process.platform !== 'win32',
        env: command.env ? { ...env, ...command.env } : env,
        stdio: ['inherit', 'pipe', 'pipe'],
      });
      let routeLockSeen = false;
      let resolveChildExit;
      const childExitPromise = new Promise((resolve) => {
        resolveChildExit = resolve;
      });
      const markRouteLock = (data) => {
        if (PORTLESS_ROUTE_LOCK_PATTERN.test(data.toString())) {
          routeLockSeen = true;
        }
      };

      children.push(child);
      child.stdout?.on('data', (data) => {
        markRouteLock(data);
        stdout.write(data);
      });
      child.stderr?.on('data', (data) => {
        markRouteLock(data);
        stderr.write(data);
      });
      child.once('exit', (code, signal) => {
        resolveChildExit();

        if (shuttingDown) {
          return;
        }

        if (command.appKey && routeLockSeen && attempt < maxAttempts) {
          return;
        }

        stopChildren(signal ?? 'SIGTERM');
        resolveExit(code ?? 1);
      });
      child.once('error', (error) => {
        resolveChildExit();

        if (shuttingDown) {
          return;
        }

        stderr.write(`Failed to start ${command.label}: ${error.message}\n`);
        stopChildren();
        resolveExit(1);
      });

      if (command.appKey) {
        await waitForOutputPattern({
          child,
          patterns: [
            /-- Using port \d+/u,
            /Portless URL:/u,
            PORTLESS_ROUTE_LOCK_PATTERN,
          ],
        });

        const exited = await waitForChildExitOrTimeout(
          childExitPromise,
          routeLockExitTimeoutMs
        );

        if (routeLockSeen && exited && attempt < maxAttempts) {
          stdout.write(
            `Retrying ${command.appKey} after Portless route lock clears...\n`
          );
          await sleep(routeLockRetryDelayMs);
          continue;
        }
      }

      break;
    }
  }

  if (getRunningChildren().length === 0) {
    resolveExit(0);
  }

  const exitCode = await exitPromise;

  process.removeListener('SIGINT', handleSignal);
  process.removeListener('SIGTERM', handleSignal);

  return exitCode;
}

function printUsage(stdout = process.stdout) {
  stdout.write(
    [
      'Usage: node scripts/dev-workspaces.js <target> [--force|--no-reuse] [--with-shared-watchers|--no-shared-watchers] [turbo args...]',
      '',
      `Targets: ${Object.keys(DEV_TARGETS).sort().join(', ')}`,
      '',
      'By default, already-running Portless routes and default localhost ports are reused.',
      'Use --force or --no-reuse to include already-running app workspaces.',
      '`dev:web` skips shared package watchers by default; use --with-shared-watchers when editing package source.',
      '',
    ].join('\n')
  );
}

async function runDevWorkspaces({
  aliasRunner = spawnSync,
  argv = process.argv.slice(2),
  checkPort = isTcpPortOpen,
  env = process.env,
  getPortlessListOutputImpl = getPortlessListOutput,
  rootDir = ROOT_DIR,
  setupPortless = runPortlessSetup,
  spawnImpl = spawn,
  stderr = process.stderr,
  stdout = process.stdout,
} = {}) {
  const parsed = parseArgs(argv);

  if (!parsed.targetName || parsed.targetName === '--help') {
    printUsage(stdout);
    return 0;
  }

  if (!DEV_TARGETS[parsed.targetName]) {
    stderr.write(`Unknown dev target: ${parsed.targetName}\n`);
    printUsage(stderr);
    return 1;
  }

  if (!parsed.dryRun) {
    const setupExitCode = setupPortless({
      env,
      error: (message) => stderr.write(`${message}\n`),
      isTTY: process.stdin.isTTY,
      log: (message) => stdout.write(`${message}\n`),
    });

    if (setupExitCode !== 0) {
      return setupExitCode;
    }
  }

  const catalog = loadAppCatalog({ rootDir });
  const portlessListOutput = getPortlessListOutputImpl({ env, rootDir });
  const appStates = await resolveAppStates(
    DEV_TARGETS[parsed.targetName].apps,
    {
      aliasRunner,
      catalog,
      checkPort,
      forceStart: parsed.forceStart,
      portlessListOutput,
      registerAliases: !parsed.dryRun,
      rootDir,
    }
  );
  const serviceStates = await resolveServiceStates(
    DEV_TARGETS[parsed.targetName].services ?? []
  );
  const includeSharedWatchers =
    parsed.includeSharedWatchers ?? parsed.targetName !== 'web';
  const plan = createDevPlan(parsed.targetName, {
    appStates,
    catalog,
    env,
    forceStart: parsed.forceStart,
    includeSharedWatchers,
    portlessCaCertPath: getPortlessCaCertPath({ env }),
    rootDir,
    serviceStates,
    turboArgs: parsed.turboArgs,
  });
  const skippedApps = formatSkippedApps(plan.skippedAppKeys, appStates);
  const skippedServices = formatSkippedServices(
    plan.skippedServiceKeys,
    serviceStates
  );

  if (skippedApps) {
    stdout.write(`Reusing running dev app(s): ${skippedApps}\n`);
  }
  if (skippedServices) {
    stdout.write(`Reusing running dev service(s): ${skippedServices}\n`);
  }
  for (const warning of formatAliasCleanupWarnings(appStates)) {
    stderr.write(`${warning}\n`);
  }

  if (plan.skippedSharedFilters.length > 0) {
    stdout.write(
      `Skipping shared package watchers for dev:${parsed.targetName}: ${plan.skippedSharedFilters.join(', ')}. Pass --with-shared-watchers when editing those packages.\n`
    );
  }

  for (const appKey of plan.skippedAppKeys) {
    const alias = appStates[appKey]?.alias;

    if (alias && !alias.ok) {
      stderr.write(
        `Could not register Portless alias for ${appKey}; continuing to reuse the existing localhost listener. ${alias.output}\n`
      );
    }
  }

  if (plan.commands.length === 0) {
    stdout.write(
      `All app workspaces and services for dev:${parsed.targetName} are already running.\n`
    );
    return 0;
  }

  stdout.write(
    [
      `Starting dev:${parsed.targetName}:`,
      ...plan.commands.map((command) => `  ${formatDevCommand(command)}`),
      '',
    ].join('\n')
  );

  if (parsed.dryRun) {
    return 0;
  }

  return spawnDevCommands({
    commands: plan.commands,
    env,
    rootDir,
    spawnImpl,
    stderr,
    stdout,
  });
}

if (require.main === module) {
  runDevWorkspaces().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  DEV_SERVICES,
  DEV_TARGETS,
  createDevPlan,
  formatAliasCleanupWarnings,
  formatDevCommand,
  getActivePortlessRouteHost,
  getAppCommandEnv,
  getPortlessAliasName,
  getPortlessExpectedUrl,
  getPortlessHost,
  getServiceCommandEnv,
  isPortlessRouteActive,
  loadAppCatalog,
  loadEnvFiles,
  parseArgs,
  parseDefaultPort,
  parseEnvFileContent,
  registerPortlessAlias,
  removePortlessAlias,
  resolveAppStates,
  resolveServiceStates,
  runDevWorkspaces,
  spawnDevCommands,
};
