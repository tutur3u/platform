const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(ROOT_DIR, 'apps', 'tasks');
const TASKS_PORT = '7809';
const TASKS_ROUTE_NAME = 'tasks.tuturuuu';
const TASKS_HOST_REDIS_REST_URL = 'http://127.0.0.1:8079';
const DEFAULT_LOG_PATH = path.join(
  ROOT_DIR,
  'tmp',
  'e2e-diagnostics',
  'tasks-satellite.log'
);

function isTruthy(value) {
  return /^(1|true|yes|on)$/iu.test(String(value ?? '').trim());
}

function isFalsy(value) {
  return /^(0|false|no|off)$/iu.test(String(value ?? '').trim());
}

function shouldStartTasksSatellite(playwrightArgs = [], env = process.env) {
  if (isFalsy(env.E2E_TASKS_SATELLITE_ENABLED)) return false;
  if (isTruthy(env.E2E_TASKS_SATELLITE_ENABLED)) return true;
  if (playwrightArgs.length === 0) return true;

  return playwrightArgs.some((arg) =>
    String(arg).includes('tasks-workspace-lifecycle')
  );
}

function getTasksSatelliteUrl(env = process.env) {
  const portlessPort = String(env.PORTLESS_PORT || '1355').trim();
  return `https://${TASKS_ROUTE_NAME}.localhost:${portlessPort}`;
}

function getTasksSatellitePortlessEnv(env = process.env) {
  return {
    ...env,
    DOCKER_WEB_FRONTEND: 'next',
    DOCKER_WEB_PROXY_HOST_PORT: TASKS_PORT,
    PORTLESS_ROUTE_NAME: TASKS_ROUTE_NAME,
  };
}

function getTasksSatellitePlaywrightEnv(env = process.env) {
  return {
    ...env,
    TASKS_BASE_URL: getTasksSatelliteUrl(env),
  };
}

function createTasksSatelliteEnv(env = process.env) {
  const tasksUrl = getTasksSatelliteUrl(env);
  const webUrl = env.BASE_URL || 'https://tuturuuu.localhost:1355';
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:8001';
  const webProxyPort = env.DOCKER_WEB_PROXY_HOST_PORT || '7803';

  return {
    ...env,
    BASE_URL: tasksUrl,
    DOCKER_INTERNAL_SUPABASE_URL: supabaseUrl,
    INTERNAL_WEB_API_ORIGIN: `http://127.0.0.1:${webProxyPort}`,
    NEXT_PUBLIC_APP_URL: tasksUrl,
    NEXT_PUBLIC_TASKS_APP_URL: tasksUrl,
    NEXT_PUBLIC_WEB_APP_URL: webUrl,
    NODE_ENV: 'development',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
    PORT: TASKS_PORT,
    PORTLESS_URL: tasksUrl,
    SUPABASE_SERVER_URL: supabaseUrl,
    SUPABASE_URL: supabaseUrl,
    TASKS_APP_URL: tasksUrl,
    TTR_URL: webUrl,
    UPSTASH_REDIS_REST_URL:
      env.E2E_TASKS_UPSTASH_REDIS_REST_URL || TASKS_HOST_REDIS_REST_URL,
    WEB_APP_URL: webUrl,
  };
}

function startTasksSatellite(options = {}) {
  const env = options.env ?? process.env;
  const fsImpl = options.fsImpl ?? fs;
  const logPath = options.logPath ?? DEFAULT_LOG_PATH;
  const rootDir = options.rootDir ?? ROOT_DIR;
  const spawnImpl = options.spawnImpl ?? spawn;
  const tasksDir = path.join(rootDir, 'apps', 'tasks');

  fsImpl.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fsImpl.openSync(logPath, 'w');
  let child;
  try {
    child = spawnImpl('bun', ['run', 'dev:app'], {
      cwd: tasksDir,
      env: createTasksSatelliteEnv(env),
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
    url: getTasksSatelliteUrl(env),
  };
}

async function waitForTasksSatellite(runtime, waitForUrl) {
  const result = await Promise.race([
    waitForUrl(`${runtime.url}/login`).then(() => ({ ready: true })),
    runtime.exitPromise.then((exit) => ({ exit })),
  ]);

  if (result.ready) return;

  const detail = result.exit.error
    ? result.exit.error.message
    : `exit=${result.exit.signal ?? result.exit.code ?? 'unknown'}`;
  throw new Error(`Tasks satellite stopped before it became ready: ${detail}`);
}

async function stopTasksSatellite(runtime, options = {}) {
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

function printTasksSatelliteLog(runtime, output = process.stderr) {
  const logPath = runtime?.logPath ?? DEFAULT_LOG_PATH;
  if (!fs.existsSync(logPath)) return;

  const lines = fs.readFileSync(logPath, 'utf8').trimEnd().split(/\r?\n/u);
  output.write('[e2e-diagnostics] Tasks satellite log (last 200 lines)\n');
  output.write(`${lines.slice(-200).join('\n')}\n`);
}

module.exports = {
  createTasksSatelliteEnv,
  DEFAULT_LOG_PATH,
  getTasksSatellitePortlessEnv,
  getTasksSatellitePlaywrightEnv,
  getTasksSatelliteUrl,
  printTasksSatelliteLog,
  shouldStartTasksSatellite,
  startTasksSatellite,
  stopTasksSatellite,
  TASKS_DIR,
  TASKS_HOST_REDIS_REST_URL,
  TASKS_PORT,
  TASKS_ROUTE_NAME,
  waitForTasksSatellite,
};
