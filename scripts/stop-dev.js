#!/usr/bin/env node
// Stop this repo's local dev servers and clean stale Portless aliases.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_ROUTE_WAIT_MS = 750;
const PORTLESS_HOST_SUFFIX = '.localhost';

function readJson(filePath, fsImpl = fs) {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function getPortlessRoutesPath({
  env = process.env,
  homeDir = os.homedir(),
} = {}) {
  return path.join(
    env.PORTLESS_STATE_DIR || path.join(homeDir, '.portless'),
    'routes.json'
  );
}

function parsePortlessRoutes(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (route) =>
        route &&
        typeof route.hostname === 'string' &&
        Number.isFinite(Number(route.port))
    )
    .map((route) => ({
      hostname: route.hostname,
      pid: Number(route.pid) || 0,
      port: Number(route.port),
    }));
}

function readPortlessRoutes({
  env = process.env,
  fsImpl = fs,
  homeDir = os.homedir(),
} = {}) {
  const routesPath = getPortlessRoutesPath({ env, homeDir });

  if (!fsImpl.existsSync(routesPath)) {
    return [];
  }

  return parsePortlessRoutes(fsImpl.readFileSync(routesPath, 'utf8'));
}

function loadKnownProjectHosts({ fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const configPath = path.join(rootDir, 'portless.json');

  if (!fsImpl.existsSync(configPath)) {
    return new Set();
  }

  const config = readJson(configPath, fsImpl);
  const names = Object.values(config.apps ?? {})
    .map((app) => app?.name)
    .filter((name) => typeof name === 'string' && name.trim().length > 0);

  return new Set(names.map((name) => `${name}${PORTLESS_HOST_SUFFIX}`));
}

function isSameProjectHost(hostname, appHost, knownHosts) {
  if (hostname === appHost) {
    return true;
  }

  if (knownHosts.has(hostname) || !hostname.endsWith(`.${appHost}`)) {
    return false;
  }

  return hostname.split('.').length === appHost.split('.').length + 1;
}

function isProjectRoute(route, knownHosts) {
  for (const host of knownHosts) {
    if (isSameProjectHost(route.hostname, host, knownHosts)) {
      return true;
    }
  }

  return false;
}

function getPortlessAliasName(hostname) {
  return hostname.endsWith(PORTLESS_HOST_SUFFIX)
    ? hostname.slice(0, -PORTLESS_HOST_SUFFIX.length)
    : hostname;
}

function defaultRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: options.timeout,
  });
}

function getCommandOutput(result) {
  return [result?.stdout, result?.stderr].filter(Boolean).join('\n').trim();
}

function createPortProbe(netImpl = net) {
  return (port, { host = '127.0.0.1', timeoutMs = 250 } = {}) =>
    new Promise((resolve) => {
      let settled = false;
      const socket = netImpl.connect({ host, port });
      const finish = (ok) => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();
        resolve(ok);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
}

function listPortPids(
  port,
  { runner = defaultRunner, rootDir = ROOT_DIR } = {}
) {
  const result = runner('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN'], {
    capture: true,
    cwd: rootDir,
    timeout: 5000,
  });

  if (result.status !== 0) {
    return [];
  }

  return getCommandOutput(result)
    .split(/\s+/u)
    .map((value) => Number.parseInt(value, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);

    timeout.unref?.();
  });
}

function isProcessAlive(pid, processImpl = process) {
  try {
    processImpl.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sendSignal(
  pid,
  signal,
  { platform = process.platform, processImpl = process } = {}
) {
  if (platform !== 'win32') {
    try {
      processImpl.kill(-pid, signal);
      return;
    } catch {}
  }

  processImpl.kill(pid, signal);
}

async function stopPids(
  pids,
  {
    dryRun = false,
    graceMs = DEFAULT_ROUTE_WAIT_MS,
    platform = process.platform,
    processImpl = process,
  } = {}
) {
  const uniquePids = [...new Set(pids)].filter(
    (pid) => Number.isInteger(pid) && pid > 0
  );
  const results = [];

  for (const pid of uniquePids) {
    if (dryRun) {
      results.push({ action: 'dry-run', ok: true, pid });
      continue;
    }

    if (!isProcessAlive(pid, processImpl)) {
      results.push({ action: 'already-stopped', ok: true, pid });
      continue;
    }

    try {
      sendSignal(pid, 'SIGTERM', { platform, processImpl });
      results.push({ action: 'SIGTERM', ok: true, pid });
    } catch (error) {
      results.push({
        action: 'SIGTERM',
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        pid,
      });
    }
  }

  if (!dryRun && uniquePids.length > 0) {
    await sleep(graceMs);
    for (const pid of uniquePids) {
      if (!isProcessAlive(pid, processImpl)) {
        continue;
      }

      try {
        sendSignal(pid, 'SIGKILL', { platform, processImpl });
        results.push({ action: 'SIGKILL', ok: true, pid });
      } catch (error) {
        results.push({
          action: 'SIGKILL',
          error: error instanceof Error ? error.message : String(error),
          ok: false,
          pid,
        });
      }
    }
  }

  return results;
}

function runCommand({
  args,
  command,
  dryRun = false,
  env = process.env,
  label,
  rootDir = ROOT_DIR,
  runner = defaultRunner,
}) {
  if (dryRun) {
    return { dryRun: true, label, status: 0 };
  }

  const result = runner(command, args, {
    capture: false,
    cwd: rootDir,
    env,
    timeout: 60_000,
  });

  return {
    label,
    output: getCommandOutput(result),
    status: result.status ?? 1,
  };
}

async function removeStaleProjectAliases({
  checkPort = createPortProbe(),
  dryRun = false,
  env = process.env,
  knownHosts,
  rootDir = ROOT_DIR,
  routes,
  runner = defaultRunner,
} = {}) {
  const results = [];
  const projectAliases = routes.filter(
    (route) => route.pid === 0 && isProjectRoute(route, knownHosts)
  );

  for (const route of projectAliases) {
    if (await checkPort(route.port)) {
      results.push({
        action: 'kept-active',
        hostname: route.hostname,
        ok: true,
        port: route.port,
      });
      continue;
    }

    const aliasName = getPortlessAliasName(route.hostname);
    const result = runCommand({
      args: ['portless', 'alias', '--remove', aliasName],
      command: 'bunx',
      dryRun,
      env,
      label: `remove ${aliasName}`,
      rootDir,
      runner,
    });

    results.push({
      action: 'removed',
      aliasName,
      hostname: route.hostname,
      ok: result.status === 0,
      output: result.output,
      port: route.port,
    });
  }

  return results;
}

async function collectProjectRoutePids({
  listPids = listPortPids,
  knownHosts,
  routes,
} = {}) {
  const pids = [];
  const projectRoutes = routes.filter((route) =>
    isProjectRoute(route, knownHosts)
  );

  for (const route of projectRoutes) {
    if (route.pid > 0) {
      pids.push(route.pid);
    }

    for (const pid of await Promise.resolve(listPids(route.port))) {
      pids.push(pid);
    }
  }

  return [...new Set(pids)];
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('--help') || argv.includes('-h'),
    skipDoctor: argv.includes('--no-doctor'),
    skipSupabase: argv.includes('--no-supabase'),
  };
}

function printUsage(stdout = process.stdout) {
  stdout.write(
    [
      'Usage: bun stop [--dry-run] [--no-doctor] [--no-supabase]',
      '',
      "Stops this repo's Portless-registered Next.js dev servers, prunes Portless routes,",
      'removes stale static aliases, stops local Supabase, and runs bun doctor.',
      '',
    ].join('\n')
  );
}

async function stopDev({
  argv = process.argv.slice(2),
  checkPort = createPortProbe(),
  env = process.env,
  fsImpl = fs,
  homeDir = os.homedir(),
  listPids,
  platform = process.platform,
  processImpl = process,
  rootDir = ROOT_DIR,
  runner = defaultRunner,
  stderr = process.stderr,
  stdout = process.stdout,
} = {}) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    printUsage(stdout);
    return 0;
  }

  const knownHosts = loadKnownProjectHosts({ fsImpl, rootDir });
  const routes = readPortlessRoutes({ env, fsImpl, homeDir });
  const projectRoutes = routes.filter((route) =>
    isProjectRoute(route, knownHosts)
  );

  stdout.write(`Found ${projectRoutes.length} project Portless route(s).\n`);

  const pids = await collectProjectRoutePids({
    knownHosts,
    listPids: listPids ?? ((port) => listPortPids(port, { rootDir, runner })),
    routes,
  });

  if (pids.length > 0) {
    stdout.write(
      `${parsed.dryRun ? 'Would stop' : 'Stopping'} ${pids.length} dev server process(es): ${pids.join(', ')}\n`
    );
  } else {
    stdout.write(
      'No project dev server processes found from Portless routes.\n'
    );
  }

  const stopResults = await stopPids(pids, {
    dryRun: parsed.dryRun,
    platform,
    processImpl,
  });
  for (const result of stopResults) {
    if (!result.ok) {
      stderr.write(`Failed to stop pid ${result.pid}: ${result.error}\n`);
    }
  }

  const prune = runCommand({
    args: ['portless', 'prune'],
    command: 'bunx',
    dryRun: parsed.dryRun,
    env,
    label: 'portless prune',
    rootDir,
    runner,
  });
  stdout.write(
    `${parsed.dryRun ? 'Would run' : 'Ran'} bunx portless prune${prune.status === 0 ? '' : ` (exit ${prune.status})`}\n`
  );

  const routesAfterPrune = parsed.dryRun
    ? routes
    : readPortlessRoutes({ env, fsImpl, homeDir });
  const aliasResults = await removeStaleProjectAliases({
    checkPort,
    dryRun: parsed.dryRun,
    env,
    knownHosts,
    rootDir,
    routes: routesAfterPrune.length > 0 ? routesAfterPrune : routes,
    runner,
  });
  for (const result of aliasResults) {
    if (result.action === 'kept-active') {
      stdout.write(
        `Kept active Portless alias ${result.hostname} on :${result.port}.\n`
      );
      continue;
    }

    stdout.write(
      `${parsed.dryRun ? 'Would remove' : 'Removed'} stale Portless alias ${result.hostname}.\n`
    );
    if (!result.ok) {
      stderr.write(
        `Failed to remove alias ${result.hostname}: ${result.output || 'unknown error'}\n`
      );
    }
  }

  let supabase = { status: 0 };
  if (!parsed.skipSupabase) {
    supabase = runCommand({
      args: ['sb:stop'],
      command: 'bun',
      dryRun: parsed.dryRun,
      env,
      label: 'bun sb:stop',
      rootDir,
      runner,
    });
    stdout.write(
      `${parsed.dryRun ? 'Would run' : 'Ran'} bun sb:stop${supabase.status === 0 ? '' : ` (exit ${supabase.status})`}\n`
    );
  }

  let doctor = { status: 0 };
  if (!parsed.skipDoctor) {
    doctor = runCommand({
      args: ['doctor'],
      command: 'bun',
      dryRun: parsed.dryRun,
      env,
      label: 'bun doctor',
      rootDir,
      runner,
    });
    stdout.write(
      `${parsed.dryRun ? 'Would run' : 'Ran'} bun doctor${doctor.status === 0 ? '' : ` (exit ${doctor.status})`}\n`
    );
  }

  const failedStop = stopResults.some((result) => !result.ok);
  if (failedStop) {
    return 1;
  }
  if (prune.status !== 0) {
    return prune.status;
  }
  const failedAlias = aliasResults.some((result) => result.ok === false);
  if (failedAlias) {
    return 1;
  }
  if (supabase.status !== 0) {
    return supabase.status;
  }
  if (doctor.status !== 0) {
    return doctor.status;
  }
  return 0;
}

if (require.main === module) {
  stopDev().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  collectProjectRoutePids,
  getPortlessAliasName,
  isProjectRoute,
  loadKnownProjectHosts,
  parseArgs,
  parsePortlessRoutes,
  readPortlessRoutes,
  removeStaleProjectAliases,
  stopDev,
  stopPids,
};
