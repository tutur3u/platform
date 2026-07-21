#!/usr/bin/env node
// `bun doctor` - diagnose the local dev environment and (optionally) repair it.
//
// Focused on the failure modes that quietly break local development on this
// monorepo: a stale Portless proxy whose routing table points at dead
// dev-server ports (so app-to-app internal API calls 404), a proxy that is not
// running at all, or an unexpected Node runtime. Run `bun doctor --fix` to
// attempt the safe automatic repairs.

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
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
const ROOT_DIR = path.resolve(__dirname, '..');
const MIN_NODE_MAJOR = 22;
const SUPABASE_PORTS = { api: 8001, db: 8002, studio: 8003 };
const REDIS_PORTS = { redis: 6379, httpBridge: 8079 };
const SUPABASE_ENV_KEYS = Object.freeze([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
]);
const WEB_REDIS_ENV_KEYS = Object.freeze([
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]);
const WEB_ENV_FILE = path.join(ROOT_DIR, 'apps', 'web', '.env.local');
const ANSI_CODES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function createRunner() {
  return (command, args, { capture = false } = {}) =>
    spawnSync(command, args, {
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
}

function hasEnv(env, name) {
  return Object.hasOwn(env, name);
}

function shouldUseColor({
  colorsEnabled,
  env = process.env,
  stdout = process.stdout,
} = {}) {
  if (typeof colorsEnabled === 'boolean') {
    return colorsEnabled;
  }
  if (hasEnv(env, 'NO_COLOR')) {
    return false;
  }
  if (hasEnv(env, 'FORCE_COLOR')) {
    const force = String(env.FORCE_COLOR).toLowerCase();
    return force !== '0' && force !== 'false';
  }
  return Boolean(stdout?.isTTY);
}

function createColorizer(enabled = false) {
  const wrap = (codes, value) =>
    enabled ? `${codes.join('')}${value}${ANSI_CODES.reset}` : String(value);

  return {
    bold: (value) => wrap([ANSI_CODES.bold], value),
    dim: (value) => wrap([ANSI_CODES.dim], value),
    fail: (value) => wrap([ANSI_CODES.red], value),
    failStrong: (value) => wrap([ANSI_CODES.red, ANSI_CODES.bold], value),
    header: (value) => wrap([ANSI_CODES.cyan, ANSI_CODES.bold], value),
    ok: (value) => wrap([ANSI_CODES.green], value),
    okStrong: (value) => wrap([ANSI_CODES.green, ANSI_CODES.bold], value),
    warn: (value) => wrap([ANSI_CODES.yellow], value),
    warnStrong: (value) => wrap([ANSI_CODES.yellow, ANSI_CODES.bold], value),
  };
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

function firstOutputLine(result) {
  const output = `${result?.stderr ?? ''}\n${result?.stdout ?? ''}`
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (output) {
    return output;
  }
  if (result?.error) {
    return result.error.message;
  }
  if (Number.isFinite(result?.status)) {
    return `exit code ${result.status}`;
  }
  return 'command did not complete';
}

function checkDockerStatus(result) {
  if (result && result.status === 0 && !result.error) {
    return {
      id: 'docker',
      title: 'Docker daemon',
      status: 'ok',
      detail: 'docker info succeeded',
    };
  }

  return {
    id: 'docker',
    title: 'Docker daemon',
    status: 'fail',
    detail: `docker info failed (${firstOutputLine(result)})`,
    hint: 'Start Docker Desktop or the local Docker daemon.',
  };
}

function formatPortStatus(name, port, reachable) {
  return `${name} :${port} ${reachable ? 'ok' : 'down'}`;
}

function getPortlessAliasName(hostname) {
  return hostname.endsWith('.localhost')
    ? hostname.slice(0, -'.localhost'.length)
    : hostname;
}

function getPortlessAliasRemoveCommand(hostname) {
  return `bunx portless alias --remove ${getPortlessAliasName(hostname)}`;
}

function stripUnquotedInlineComment(value) {
  const quote = value[0];

  if (quote === '"' || quote === "'") {
    const closingQuoteIndex = value.lastIndexOf(quote);
    return closingQuoteIndex > 0
      ? value.slice(0, closingQuoteIndex + 1)
      : value;
  }

  return value.replace(/\s+#.*$/u, '').trimEnd();
}

function parseEnvContent(content) {
  const values = {};

  for (const rawLine of String(content ?? '').split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const exported = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = exported.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = exported.slice(0, separatorIndex).trim();
    const rawValue = stripUnquotedInlineComment(
      exported.slice(separatorIndex + 1).trim()
    );
    values[key] = rawValue.replace(/^(['"])(.*)\1$/u, '$2');
  }

  return values;
}

function readEnvFile(envFilePath, { fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const relativePath = path.relative(rootDir, envFilePath) || '.env.local';

  if (!fsImpl.existsSync(envFilePath)) {
    return { exists: false, path: envFilePath, relativePath, values: {} };
  }

  return {
    exists: true,
    path: envFilePath,
    relativePath,
    values: parseEnvContent(fsImpl.readFileSync(envFilePath, 'utf8')),
  };
}

function getAppEnvFiles({ fsImpl = fs, rootDir = ROOT_DIR } = {}) {
  const files = [];
  const appsDir = path.join(rootDir, 'apps');

  if (!fsImpl.existsSync(appsDir)) {
    return files;
  }

  for (const entry of fsImpl.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const envFile = path.join(appsDir, entry.name, '.env.local');
    if (fsImpl.existsSync(envFile)) {
      files.push(readEnvFile(envFile, { fsImpl, rootDir }));
    }
  }

  return files;
}

function hashEnvValue(value) {
  return crypto
    .createHash('sha256')
    .update(String(value ?? ''))
    .digest('hex')
    .slice(0, 10);
}

function redactUrlValue(value) {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return '<empty>';
  }

  try {
    const url = new URL(raw);
    const host =
      url.hostname.endsWith('.supabase.co') && url.hostname !== 'supabase.co'
        ? '<project-ref>.supabase.co'
        : url.hostname;
    return `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return `<invalid-url sha256:${hashEnvValue(raw)}>`;
  }
}

function redactEnvValue(key, value) {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return '<empty>';
  }

  if (key.endsWith('_URL')) {
    return `${redactUrlValue(raw)} (sha256:${hashEnvValue(raw)})`;
  }

  return `<redacted sha256:${hashEnvValue(raw)} len:${raw.length}>`;
}

function getDefinedEnvRecords(envFiles, key) {
  return envFiles
    .filter((file) => Object.hasOwn(file.values, key))
    .map((file) => ({
      file: file.relativePath,
      value: String(file.values[key] ?? '').trim(),
    }));
}

function hasAnyEnvKey(file, keys) {
  return keys.some((key) => Object.hasOwn(file.values, key));
}

function checkSupabaseEnvConsistency({ envFiles = getAppEnvFiles() } = {}) {
  const relevantFiles = envFiles.filter((file) =>
    hasAnyEnvKey(file, SUPABASE_ENV_KEYS)
  );
  const items = [];
  const details = [];

  for (const key of SUPABASE_ENV_KEYS) {
    const records = getDefinedEnvRecords(relevantFiles, key);
    const uniqueValues = [...new Set(records.map((record) => record.value))];

    if (uniqueValues.length <= 1) {
      continue;
    }

    items.push(
      `${key}: ${uniqueValues.length} values across ${records.length} file(s)`
    );
    details.push(`${key}:`);
    for (const record of records) {
      details.push(`${record.file}: ${redactEnvValue(key, record.value)}`);
    }
  }

  const base = {
    id: 'supabase-env',
    title: 'Supabase app env consistency',
  };

  if (items.length === 0) {
    return {
      ...base,
      status: 'ok',
      detail:
        relevantFiles.length > 0
          ? `${relevantFiles.length} env file(s) define matching Supabase keys`
          : 'no .env.local files define Supabase keys',
    };
  }

  return {
    ...base,
    status: 'warn',
    detail: `${items.length} Supabase key mismatch(es) found`,
    details,
    items,
    hint: 'Pick one Supabase project and copy all three values together. For quick local development, run `bun dev:sync:apps` to copy `apps/web/.env.local` to app env files, then restart dev servers. Run `bun doctor --verbose` for redacted per-file fingerprints.',
  };
}

function getRedisUrlProblem(value) {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return 'missing';
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return 'invalid URL';
  }

  if (parsed.hostname === 'serverless-redis-http') {
    return 'uses Docker-only host `serverless-redis-http` from native apps/web env';
  }

  return null;
}

function checkWebRedisEnv({
  envFile = readEnvFile(WEB_ENV_FILE),
  redisPorts = REDIS_PORTS,
} = {}) {
  const base = { id: 'web-redis-env', title: 'apps/web Redis env' };

  if (!envFile.exists) {
    return {
      ...base,
      status: 'warn',
      detail: `${envFile.relativePath} is missing`,
      hint: 'Run `bun redis:setup` to create `apps/web/.env.local` with the local Redis bridge URL and token.',
    };
  }

  const missing = WEB_REDIS_ENV_KEYS.filter(
    (key) => !String(envFile.values[key] ?? '').trim()
  );
  const urlProblem = getRedisUrlProblem(envFile.values.UPSTASH_REDIS_REST_URL);
  const items = WEB_REDIS_ENV_KEYS.map(
    (key) => `${key}: ${redactEnvValue(key, envFile.values[key])}`
  );

  if (missing.length > 0 || urlProblem) {
    return {
      ...base,
      status: 'warn',
      detail: `${envFile.relativePath} is not ready for Redis-backed web features`,
      items: [
        ...items,
        ...(missing.length > 0 ? [`missing: ${missing.join(', ')}`] : []),
        ...(urlProblem ? [`URL problem: ${urlProblem}`] : []),
      ],
      hint: `Run \`bun redis:setup\` to start Redis and set \`UPSTASH_REDIS_REST_URL=http://localhost:${redisPorts.httpBridge}\` plus a matching token in \`apps/web/.env.local\`, then restart \`bun dev:web\`.`,
    };
  }

  return {
    ...base,
    status: 'ok',
    detail: `${envFile.relativePath} defines Redis REST URL and token`,
    items,
  };
}

async function checkSupabaseStatus({
  dockerOk,
  ports = SUPABASE_PORTS,
  probePort,
}) {
  const base = { id: 'supabase', title: 'Local Supabase stack' };

  if (!dockerOk) {
    return {
      ...base,
      status: 'warn',
      detail: 'skipped because Docker is not reachable',
      hint: 'Start Docker, then run `bun sb:start` if local Supabase is needed.',
    };
  }

  const [apiReachable, dbReachable, studioReachable] = await Promise.all([
    probePort(ports.api),
    probePort(ports.db),
    probePort(ports.studio),
  ]);
  const detail = [
    formatPortStatus('API', ports.api, apiReachable),
    formatPortStatus('DB', ports.db, dbReachable),
    formatPortStatus('Studio', ports.studio, studioReachable),
  ].join(', ');

  if (apiReachable && dbReachable) {
    return {
      ...base,
      status: 'ok',
      detail,
    };
  }

  return {
    ...base,
    status: 'warn',
    detail,
    hint: 'Start it with `bun sb:start`.',
  };
}

async function checkRedisStatus({ dockerOk, ports = REDIS_PORTS, probePort }) {
  const base = { id: 'redis', title: 'Local Redis stack' };

  if (!dockerOk) {
    return {
      ...base,
      status: 'warn',
      detail: 'skipped because Docker is not reachable',
      hint: 'Start Docker, then run `bun redis:start` if local Redis is needed.',
    };
  }

  const [redisReachable, bridgeReachable] = await Promise.all([
    probePort(ports.redis),
    probePort(ports.httpBridge),
  ]);
  const detail = [
    formatPortStatus('Redis', ports.redis, redisReachable),
    formatPortStatus('HTTP bridge', ports.httpBridge, bridgeReachable),
  ].join(', ');

  if (redisReachable && bridgeReachable) {
    return {
      ...base,
      status: 'ok',
      detail,
    };
  }

  return {
    ...base,
    status: 'warn',
    detail,
    hint: 'Start it with `bun redis:start`.',
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
      status: 'ok',
      detail: 'routes.json is present and no apps are registered yet',
    };
  }

  const routeLines = annotated.map((route) => {
    if (route.isAlias && !route.reachable) {
      return `${route.hostname} -> :${route.port} inactive alias (remove: ${getPortlessAliasRemoveCommand(route.hostname)})`;
    }

    return `${route.hostname} -> :${route.port} ${
      route.reachable ? 'ok' : 'DEAD'
    }${route.isAlias ? ' (alias)' : ''}`;
  });

  if (staleDynamic.length > 0) {
    return {
      ...base,
      status: 'fail',
      detail: `${staleDynamic.length} of ${annotated.length} live route(s) point to a dead port (stale registration)`,
      routes: routeLines,
      hint: 'Prune stale Portless registrations so apps can re-register: `bun doctor --fix`.',
      fix: 'prune-routes',
    };
  }

  if (staleAlias.length > 0) {
    return {
      ...base,
      status: 'warn',
      detail: `${staleAlias.length} inactive static alias(es) point to a port with no running server`,
      routes: routeLines,
      hint: 'Start that app if you still use the alias, or run the remove command shown above. `bun portless:reset` does not delete static aliases.',
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

function defaultReadDockerInfo(runner) {
  return runner('docker', ['info'], { capture: true });
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
    readDockerInfo = () => defaultReadDockerInfo(runner),
    readRoutesFile = () => defaultReadRoutesFile(),
    readSupabaseEnvFiles = () => getAppEnvFiles(),
    readWebEnvFile = () => readEnvFile(WEB_ENV_FILE),
    caExists = () => fs.existsSync(CA_PATH),
    includeEnvChecks = true,
    includeLocalServiceChecks = true,
    probePort = createPortProbe(),
    redisPorts = REDIS_PORTS,
    supabasePorts = SUPABASE_PORTS,
  } = deps;

  const checks = [checkNodeVersion(nodeVersion, { minMajor: minNodeMajor })];

  if (includeLocalServiceChecks) {
    const dockerCheck = checkDockerStatus(readDockerInfo());
    const dockerOk = dockerCheck.status === 'ok';
    checks.push(dockerCheck);
    checks.push(
      await checkSupabaseStatus({
        dockerOk,
        ports: supabasePorts,
        probePort,
      })
    );
    checks.push(
      await checkRedisStatus({ dockerOk, ports: redisPorts, probePort })
    );
  }

  if (includeEnvChecks) {
    checks.push(
      checkSupabaseEnvConsistency({ envFiles: readSupabaseEnvFiles() })
    );
    checks.push(checkWebRedisEnv({ envFile: readWebEnvFile(), redisPorts }));
  }

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

function formatStatusTag(status, colors) {
  const tag = `[${STATUS_TAG[status] ?? '????'}]`;
  if (status === 'ok') {
    return colors.ok(tag);
  }
  if (status === 'warn') {
    return colors.warn(tag);
  }
  if (status === 'fail') {
    return colors.fail(tag);
  }
  return colors.dim(tag);
}

function colorizeStatusWords(line, colors) {
  return line
    .replace(/\bDEAD\b/gu, colors.failStrong('DEAD'))
    .replace(/\binactive alias\b/gu, colors.warn('inactive alias'))
    .replace(/\bdown\b/gu, colors.warn('down'))
    .replace(/\bok\b/gu, colors.ok('ok'));
}

function formatDoctorReport(checks, options = {}) {
  const colors = createColorizer(Boolean(options.colorsEnabled));
  const verbose = Boolean(options.verbose);
  const lines = [colors.header('Tuturuuu dev environment doctor'), ''];

  for (const check of checks) {
    lines.push(`${formatStatusTag(check.status, colors)} ${check.title}`);
    if (check.detail) {
      lines.push(
        `       ${colors.dim(colorizeStatusWords(check.detail, colors))}`
      );
    }
    for (const item of check.items ?? check.routes ?? []) {
      lines.push(`         - ${colorizeStatusWords(item, colors)}`);
    }
    if (verbose) {
      for (const detail of check.details ?? []) {
        lines.push(`         - ${colorizeStatusWords(detail, colors)}`);
      }
    } else if (check.details?.length) {
      lines.push(
        `         - ${colors.dim('Run `bun doctor --verbose` for redacted per-file details.')}`
      );
    }
    if (check.hint && check.status !== 'ok') {
      lines.push(`       ${colors.dim(`-> ${check.hint}`)}`);
    }
  }

  const summary = summarizeChecks(checks);
  lines.push('');
  if (summary.fail > 0) {
    lines.push(
      colors.failStrong(
        `${summary.fail} issue(s) need attention. Run \`bun doctor --fix\` to attempt automatic repair.`
      )
    );
  } else if (summary.warn > 0) {
    lines.push(
      colors.warnStrong(
        `No blocking issues. ${summary.warn} warning(s) above; follow the hints for optional cleanup.`
      )
    );
  } else {
    lines.push(colors.okStrong('All checks passed.'));
  }

  return `${lines.join('\n')}\n`;
}

// Collapse the per-check fix hints into a short recovery plan. Pruning stale
// route registrations does not require restarting the root-owned proxy.
function getFixActions(checks) {
  const fixes = new Set(
    checks
      .filter((check) => check.status === 'fail' && check.fix)
      .map((check) => check.fix)
  );

  if (fixes.has('reset-proxy')) {
    return ['reset-proxy'];
  }
  if (fixes.has('prune-routes') && fixes.has('start-proxy')) {
    return ['prune-routes', 'start-proxy'];
  }
  if (fixes.has('prune-routes')) {
    return ['prune-routes'];
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
  if (action === 'prune-routes') {
    return [['prune']];
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
  const verbose = argv.includes('--verbose');

  if (argv.includes('--help') || argv.includes('-h')) {
    log(`Usage: bun doctor [--fix] [--verbose]

Diagnose the local dev environment (Node runtime, Docker, local services,
and Portless proxy/routing).

Options:
  --fix    Attempt safe automatic repairs (start or reset the Portless proxy)
           and re-run the checks.
  --verbose
           Show expanded redacted env mismatch details.
`);
    return 0;
  }

  const colorsEnabled = shouldUseColor({
    colorsEnabled: deps.colorsEnabled,
    env: deps.env,
    stdout: deps.stdout,
  });

  const checks = await collectDoctorChecks(deps);
  log(formatDoctorReport(checks, { colorsEnabled, verbose }));

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
  if (
    fixActions.includes('reset-proxy') ||
    fixActions.includes('prune-routes')
  ) {
    log(
      'Restart your dev servers (e.g. `bun dev:inventory`) so each app re-registers its route.'
    );
  }

  log('');
  log('Re-running checks...');
  const after = await collectDoctorChecks(deps);
  log(formatDoctorReport(after, { colorsEnabled, verbose }));

  return summarizeChecks(after).exitCode;
}

if (require.main === module) {
  runDoctor().then((code) => {
    process.exitCode = code;
  });
}

module.exports = {
  analyzePortlessRoutes,
  checkDockerStatus,
  checkNodeVersion,
  checkPortlessCa,
  checkPortlessProxy,
  checkPortlessRoutes,
  checkRedisStatus,
  checkSupabaseStatus,
  checkSupabaseEnvConsistency,
  checkWebRedisEnv,
  collectDoctorChecks,
  createPortProbe,
  formatDoctorReport,
  getPortlessAliasName,
  getPortlessAliasRemoveCommand,
  getFixActions,
  getFixSteps,
  parseEnvContent,
  parsePortlessRoutes,
  redactEnvValue,
  runDoctor,
  shouldUseColor,
  summarizeChecks,
};
