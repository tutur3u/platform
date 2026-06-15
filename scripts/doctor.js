#!/usr/bin/env node
// `bun doctor` - diagnose the local dev environment and (optionally) repair it.
//
// Focused on the failure modes that quietly break local development on this
// monorepo: a stale Portless proxy whose routing table points at dead
// dev-server ports (so app-to-app internal API calls 404), a proxy that is not
// running at all, or an unexpected Node runtime. Run `bun doctor --fix` to
// attempt the safe automatic repairs.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const {
  getResetSteps,
  parsePortlessProxyReady,
  resolvePortlessBin,
} = require('./setup-portless');

const ROUTES_PATH = path.join(os.homedir(), '.portless', 'routes.json');
const CA_PATH = path.join(os.homedir(), '.portless', 'ca.pem');
const MIN_NODE_MAJOR = 22;

function createRunner() {
  return (command, args, { capture = false } = {}) =>
    spawnSync(command, args, {
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
}

// Returns a probe(port) -> Promise<boolean> that resolves true when something
// is accepting TCP connections on 127.0.0.1:<port>.
function createPortProbe(netImpl = net) {
  return (port, { host = '127.0.0.1', timeoutMs = 500 } = {}) =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) {
          return;
        }
        settled = true;
        socket.destroy();
        resolve(ok);
      };

      const socket = netImpl.connect({ host, port });
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
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
      port: Number(route.port),
      pid: Number(route.pid) || 0,
    }));
}

function checkNodeVersion(version, { minMajor = MIN_NODE_MAJOR } = {}) {
  const major = Number.parseInt(String(version).replace(/^v/u, ''), 10);
  const ok = Number.isFinite(major) && major >= minMajor;

  return {
    id: 'node',
    title: 'Node.js runtime',
    status: ok ? 'ok' : 'fail',
    detail: ok
      ? `${version} (>= ${minMajor})`
      : `${version} is below the required Node ${minMajor}+`,
    ...(ok
      ? {}
      : {
          hint: `Install Node ${minMajor}+ (package.json engines require it).`,
        }),
  };
}

function checkPortlessProxy(statusOutput) {
  if (parsePortlessProxyReady(statusOutput)) {
    return {
      id: 'portless-proxy',
      title: 'Portless proxy (HTTPS :443)',
      status: 'ok',
      detail: 'responding on port 443',
    };
  }

  return {
    id: 'portless-proxy',
    title: 'Portless proxy (HTTPS :443)',
    status: 'fail',
    detail: 'not responding on port 443',
    hint: 'Start it with `bun portless:setup` (or `bun doctor --fix`).',
    fix: 'start-proxy',
  };
}

function analyzePortlessRoutes(routes, reachabilityByPort) {
  const annotated = routes.map((route) => ({
    ...route,
    // pid 0 means a static alias (`portless alias`); a non-zero pid is a live
    // `portless run` registration.
    isAlias: !route.pid,
    reachable: reachabilityByPort.get(route.port) === true,
  }));

  // A dynamic registration pointing at a dead port is the dangerous case: the
  // proxy believes an app is live but routes to nothing, so app-to-app internal
  // API calls 404. A dead alias just means that app is not running right now.
  const staleDynamic = annotated.filter(
    (route) => !route.reachable && !route.isAlias
  );
  const staleAlias = annotated.filter(
    (route) => !route.reachable && route.isAlias
  );

  return { annotated, staleAlias, staleDynamic };
}

function checkPortlessRoutes({
  routesExist,
  annotated,
  staleAlias,
  staleDynamic,
}) {
  const base = { id: 'portless-routes', title: 'Portless route health' };

  if (!routesExist) {
    return {
      ...base,
      status: 'warn',
      detail: 'no routes registered yet (routes.json missing)',
      hint: 'Start a dev server (e.g. `bun dev:inventory`) to register routes.',
    };
  }

  if (annotated.length === 0) {
    return {
      ...base,
      status: 'warn',
      detail: 'routes.json is present but empty',
      hint: 'Start a dev server (e.g. `bun dev:inventory`) to register routes.',
    };
  }

  const routeLines = annotated.map(
    (route) =>
      `${route.hostname} -> :${route.port} ${
        route.reachable ? 'ok' : 'DEAD'
      }${route.isAlias ? ' (alias)' : ''}`
  );

  if (staleDynamic.length > 0) {
    return {
      ...base,
      status: 'fail',
      detail: `${staleDynamic.length} of ${annotated.length} live route(s) point to a dead port (stale registration)`,
      routes: routeLines,
      hint: 'Reset the proxy so apps re-register: `bun portless:reset` (or `bun doctor --fix`).',
      fix: 'reset-proxy',
    };
  }

  if (staleAlias.length > 0) {
    return {
      ...base,
      status: 'warn',
      detail: `${staleAlias.length} alias(es) point to a port with no running server`,
      routes: routeLines,
      hint: 'Start that app, or remove the alias with `portless alias --remove <name>`.',
    };
  }

  return {
    ...base,
    status: 'ok',
    detail: `${annotated.length} route(s) registered, all reachable`,
    routes: routeLines,
  };
}

function checkPortlessCa(exists) {
  if (exists) {
    return {
      id: 'portless-ca',
      title: 'Portless local CA certificate',
      status: 'ok',
      detail: `${CA_PATH} present (trusted by dev servers via NODE_EXTRA_CA_CERTS)`,
    };
  }

  return {
    id: 'portless-ca',
    title: 'Portless local CA certificate',
    status: 'warn',
    detail: `${CA_PATH} is missing`,
    hint: 'Run `bun portless:setup` (then `portless trust`) to generate and trust the CA.',
  };
}

function defaultReadProxyStatus(runner, portlessBin) {
  const status = runner(portlessBin, ['service', 'status'], { capture: true });
  return `${status.stdout ?? ''}${status.stderr ?? ''}`;
}

function defaultReadRoutesFile(fsImpl = fs, routesPath = ROUTES_PATH) {
  try {
    return fsImpl.readFileSync(routesPath, 'utf8');
  } catch {
    return null;
  }
}

async function collectDoctorChecks(deps = {}) {
  const {
    nodeVersion = process.version,
    minNodeMajor = MIN_NODE_MAJOR,
    portlessBin = resolvePortlessBin(),
    runner = createRunner(),
    readProxyStatus = () => defaultReadProxyStatus(runner, portlessBin),
    readRoutesFile = () => defaultReadRoutesFile(),
    caExists = () => fs.existsSync(CA_PATH),
    probePort = createPortProbe(),
  } = deps;

  const checks = [checkNodeVersion(nodeVersion, { minMajor: minNodeMajor })];

  checks.push(checkPortlessProxy(readProxyStatus()));

  const routesText = readRoutesFile();
  const routesExist = routesText != null;
  const routes = routesExist ? parsePortlessRoutes(routesText) : [];

  const uniquePorts = [...new Set(routes.map((route) => route.port))];
  const reachabilityByPort = new Map();
  await Promise.all(
    uniquePorts.map(async (port) => {
      reachabilityByPort.set(port, await probePort(port));
    })
  );

  const { annotated, staleAlias, staleDynamic } = analyzePortlessRoutes(
    routes,
    reachabilityByPort
  );
  checks.push(
    checkPortlessRoutes({ annotated, routesExist, staleAlias, staleDynamic })
  );

  checks.push(checkPortlessCa(caExists()));

  return checks;
}

function summarizeChecks(checks) {
  const fail = checks.filter((check) => check.status === 'fail').length;
  const warn = checks.filter((check) => check.status === 'warn').length;

  return { exitCode: fail === 0 ? 0 : 1, fail, ok: fail === 0, warn };
}

const STATUS_TAG = { fail: 'FAIL', ok: 'OK', skip: 'SKIP', warn: 'WARN' };

function formatDoctorReport(checks) {
  const lines = ['Tuturuuu dev environment doctor', ''];

  for (const check of checks) {
    lines.push(`[${STATUS_TAG[check.status] ?? '????'}] ${check.title}`);
    if (check.detail) {
      lines.push(`       ${check.detail}`);
    }
    for (const route of check.routes ?? []) {
      lines.push(`         - ${route}`);
    }
    if (check.hint && check.status !== 'ok') {
      lines.push(`       -> ${check.hint}`);
    }
  }

  const summary = summarizeChecks(checks);
  lines.push('');
  if (summary.fail > 0) {
    lines.push(
      `${summary.fail} issue(s) need attention. Run \`bun doctor --fix\` to attempt automatic repair.`
    );
  } else if (summary.warn > 0) {
    lines.push(`No blocking issues. ${summary.warn} warning(s) above.`);
  } else {
    lines.push('All checks passed.');
  }

  return `${lines.join('\n')}\n`;
}

// Collapse the per-check fix hints into the strongest single recovery action:
// a full reset (stop -> prune -> start) supersedes a bare proxy start.
function getFixActions(checks) {
  const fixes = new Set(
    checks
      .filter((check) => check.status === 'fail' && check.fix)
      .map((check) => check.fix)
  );

  if (fixes.has('reset-proxy')) {
    return ['reset-proxy'];
  }
  if (fixes.has('start-proxy')) {
    return ['start-proxy'];
  }
  return [];
}

function getFixSteps(action) {
  if (action === 'reset-proxy') {
    return getResetSteps();
  }
  if (action === 'start-proxy') {
    return [['proxy', 'start']];
  }
  return [];
}

async function runDoctor({
  argv = process.argv.slice(2),
  log = console.log,
  deps = {},
} = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    log(`Usage: bun doctor [--fix]

Diagnose the local dev environment (Node runtime + Portless proxy/routing).

Options:
  --fix    Attempt safe automatic repairs (start or reset the Portless proxy)
           and re-run the checks.
`);
    return 0;
  }

  const checks = await collectDoctorChecks(deps);
  log(formatDoctorReport(checks));

  const fixActions = getFixActions(checks);

  if (!argv.includes('--fix') || fixActions.length === 0) {
    return summarizeChecks(checks).exitCode;
  }

  const runner = deps.runner ?? createRunner();
  const portlessBin = deps.portlessBin ?? resolvePortlessBin();

  log('Applying fixes...');
  for (const action of fixActions) {
    for (const step of getFixSteps(action)) {
      log(`  portless ${step.join(' ')}`);
      runner(portlessBin, step, { capture: false });
    }
  }
  if (fixActions.includes('reset-proxy')) {
    log(
      'Restart your dev servers (e.g. `bun dev:inventory`) so each app re-registers its route.'
    );
  }

  log('');
  log('Re-running checks...');
  const after = await collectDoctorChecks(deps);
  log(formatDoctorReport(after));

  return summarizeChecks(after).exitCode;
}

if (require.main === module) {
  runDoctor().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  analyzePortlessRoutes,
  checkNodeVersion,
  checkPortlessCa,
  checkPortlessProxy,
  checkPortlessRoutes,
  collectDoctorChecks,
  createPortProbe,
  formatDoctorReport,
  getFixActions,
  getFixSteps,
  parsePortlessRoutes,
  runDoctor,
  summarizeChecks,
};
