const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_LOG_DIR = path.join(ROOT_DIR, 'tmp', 'e2e-diagnostics');
const HOST_REDIS_REST_URL = 'http://127.0.0.1:8079';

const OWNED_E2E_SATELLITES = Object.freeze([
  Object.freeze({
    appEnv: {
      FORMS_APP_URL: 'url',
      NEXT_PUBLIC_FORMS_APP_URL: 'url',
    },
    appName: 'forms',
    baseUrlEnv: 'FORMS_BASE_URL',
    port: '7828',
    routeName: 'forms.tuturuuu',
    spec: 'forms-private.noauth.spec.ts',
  }),
  Object.freeze({
    appEnv: {
      INFRASTRUCTURE_APP_URL: 'url',
      INFRA_APP_URL: 'url',
      NEXT_PUBLIC_INFRASTRUCTURE_APP_URL: 'url',
      NEXT_PUBLIC_INFRA_APP_URL: 'url',
    },
    appName: 'infrastructure',
    baseUrlEnv: 'INFRASTRUCTURE_BASE_URL',
    port: '7823',
    routeName: 'infra.tuturuuu',
    spec: 'ai-credits.spec.ts',
  }),
]);

function isTruthy(value) {
  return /^(1|true|yes|on)$/iu.test(String(value ?? '').trim());
}

function isFalsy(value) {
  return /^(0|false|no|off)$/iu.test(String(value ?? '').trim());
}

function getEnabledEnvName(satellite) {
  return `E2E_${satellite.appName.toUpperCase()}_SATELLITE_ENABLED`;
}

function shouldStartOwnedSatellite(
  satellite,
  playwrightArgs = [],
  env = process.env,
  playwrightTestList = ''
) {
  const enabled = env[getEnabledEnvName(satellite)];
  if (isFalsy(enabled)) return false;
  if (isTruthy(enabled)) return true;
  if (playwrightArgs.length === 0) return true;

  return (
    playwrightArgs.some((arg) => String(arg).includes(satellite.spec)) ||
    String(playwrightTestList).includes(satellite.spec)
  );
}

function shouldDiscoverOwnedSatellitesFromTestList(
  playwrightArgs = [],
  env = process.env
) {
  if (playwrightArgs.length === 0) return false;

  return OWNED_E2E_SATELLITES.some((satellite) => {
    const enabled = env[getEnabledEnvName(satellite)];
    if (isTruthy(enabled) || isFalsy(enabled)) return false;
    return !playwrightArgs.some((arg) => String(arg).includes(satellite.spec));
  });
}

function getRequiredOwnedSatellites(
  playwrightArgs = [],
  env = process.env,
  playwrightTestList = ''
) {
  return OWNED_E2E_SATELLITES.filter((satellite) =>
    shouldStartOwnedSatellite(
      satellite,
      playwrightArgs,
      env,
      playwrightTestList
    )
  );
}

function getOwnedSatelliteUrl(satellite, env = process.env) {
  const portlessPort = String(env.PORTLESS_PORT || '1355').trim();
  return `https://${satellite.routeName}.localhost:${portlessPort}`;
}

function getOwnedSatelliteReadinessUrl(satellite) {
  return `http://127.0.0.1:${satellite.port}`;
}

function getOwnedSatelliteDependencyBuildArgs(satellite) {
  return [
    'turbo:local',
    'run',
    'build',
    `--filter=@tuturuuu/${satellite.appName}^...`,
  ];
}

function getOwnedSatellitePortlessEnv(satellite, env = process.env) {
  return {
    ...env,
    DOCKER_WEB_FRONTEND: 'next',
    DOCKER_WEB_PROXY_HOST_PORT: satellite.port,
    PORTLESS_ROUTE_NAME: satellite.routeName,
  };
}

function getOwnedSatellitesPlaywrightEnv(satellites, env = process.env) {
  const result = { ...env };
  for (const satellite of satellites) {
    result[satellite.baseUrlEnv] = getOwnedSatelliteUrl(satellite, env);
  }
  return result;
}

function createOwnedSatelliteEnv(satellite, env = process.env) {
  const url = getOwnedSatelliteUrl(satellite, env);
  const webUrl = env.BASE_URL || 'https://tuturuuu.localhost:1355';
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8001';
  const webProxyPort = env.DOCKER_WEB_PROXY_HOST_PORT || '7803';
  const appSpecificEnv = Object.fromEntries(
    Object.keys(satellite.appEnv).map((key) => [key, url])
  );

  return {
    ...env,
    ...appSpecificEnv,
    BASE_URL: url,
    DOCKER_INTERNAL_SUPABASE_URL: supabaseUrl,
    INTERNAL_WEB_API_ORIGIN: `http://127.0.0.1:${webProxyPort}`,
    NEXT_PUBLIC_APP_URL: url,
    NEXT_PUBLIC_WEB_APP_URL: webUrl,
    NODE_ENV: 'development',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    PORT: satellite.port,
    PORTLESS_URL: url,
    SUPABASE_SERVER_URL: supabaseUrl,
    SUPABASE_URL: supabaseUrl,
    TTR_URL: webUrl,
    UPSTASH_REDIS_REST_URL:
      env.E2E_SATELLITE_UPSTASH_REDIS_REST_URL || HOST_REDIS_REST_URL,
    WEB_APP_URL: webUrl,
  };
}

function startOwnedSatellite(satellite, options = {}) {
  const env = options.env ?? process.env;
  const fsImpl = options.fsImpl ?? fs;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const spawnImpl = options.spawnImpl ?? spawn;
  const logPath =
    options.logPath ??
    path.join(DEFAULT_LOG_DIR, `${satellite.appName}-satellite.log`);

  fsImpl.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fsImpl.openSync(logPath, 'w');
  let child;
  try {
    child = spawnImpl('bun', ['run', 'dev:app'], {
      cwd: path.join(rootDir, 'apps', satellite.appName),
      env: createOwnedSatelliteEnv(satellite, env),
      stdio: ['ignore', logFd, logFd],
    });
  } finally {
    fsImpl.closeSync(logFd);
  }

  const exitPromise = new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

  return {
    child,
    exitPromise,
    logPath,
    readinessUrl: getOwnedSatelliteReadinessUrl(satellite),
    satellite,
    url: getOwnedSatelliteUrl(satellite, env),
  };
}

async function waitForOwnedSatellite(runtime, waitForUrl) {
  const result = await Promise.race([
    waitForUrl(`${runtime.readinessUrl}/login`).then(() => ({ ready: true })),
    runtime.exitPromise.then((exit) => ({ exit })),
  ]);

  if (result.ready) return;

  const detail = result.exit.error
    ? result.exit.error.message
    : `exit=${result.exit.signal ?? result.exit.code ?? 'unknown'}`;
  throw new Error(
    `${runtime.satellite.appName} satellite stopped before it became ready: ${detail}`
  );
}

async function stopOwnedSatellite(runtime, options = {}) {
  if (!runtime || runtime.child.exitCode != null) return;

  runtime.child.kill('SIGTERM');
  const timeoutMs = options.timeoutMs ?? 10_000;
  const stopped = await Promise.race([
    runtime.exitPromise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);

  if (!stopped && runtime.child.exitCode == null) {
    runtime.child.kill('SIGKILL');
    await runtime.exitPromise;
  }
}

function printOwnedSatelliteLog(runtime, output = process.stderr) {
  if (!runtime || !fs.existsSync(runtime.logPath)) return;

  const lines = fs
    .readFileSync(runtime.logPath, 'utf8')
    .trimEnd()
    .split(/\r?\n/u);
  output.write(
    `[e2e-diagnostics] ${runtime.satellite.appName} satellite log (last 200 lines)\n`
  );
  output.write(`${lines.slice(-200).join('\n')}\n`);
}

module.exports = {
  createOwnedSatelliteEnv,
  getOwnedSatelliteDependencyBuildArgs,
  getOwnedSatellitePortlessEnv,
  getOwnedSatelliteReadinessUrl,
  getOwnedSatellitesPlaywrightEnv,
  getOwnedSatelliteUrl,
  getRequiredOwnedSatellites,
  OWNED_E2E_SATELLITES,
  printOwnedSatelliteLog,
  shouldDiscoverOwnedSatellitesFromTestList,
  shouldStartOwnedSatellite,
  startOwnedSatellite,
  stopOwnedSatellite,
  waitForOwnedSatellite,
};
