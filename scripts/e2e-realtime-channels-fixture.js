const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  signalOwnedProcess,
  registerOwnedRuntime,
  releaseOwnedRuntime,
  waitForOwnedExit,
} = require('./e2e-owned-process-group');
const {
  LOCAL_E2E_CHANNELS_PORT,
  LOCAL_E2E_CHANNELS_ROUTE_NAME,
  LOCAL_E2E_MEET_REALTIME_TOKEN_SECRET,
} = require('./e2e-local-environment');

const ROOT_DIR = path.resolve(__dirname, '..');
const SERVER_SCRIPT = path.join(__dirname, 'e2e-realtime-channels-server.js');
const DEFAULT_LOG_PATH = path.join(
  ROOT_DIR,
  'tmp',
  'e2e-diagnostics',
  'realtime-channels.log'
);

function getRealtimeChannelsPort(env = process.env) {
  return String(
    env.E2E_REALTIME_CHANNELS_PORT || LOCAL_E2E_CHANNELS_PORT
  ).trim();
}

function getRealtimeChannelsReadinessUrl(env = process.env) {
  return `http://127.0.0.1:${getRealtimeChannelsPort(env)}/health`;
}

function getRealtimeChannelsPortlessEnv(env = process.env) {
  return {
    ...env,
    DOCKER_WEB_FRONTEND: 'next',
    DOCKER_WEB_PROXY_HOST_PORT: getRealtimeChannelsPort(env),
    PORTLESS_ROUTE_NAME: LOCAL_E2E_CHANNELS_ROUTE_NAME,
  };
}

function startRealtimeChannelsFixture({
  env = process.env,
  logPath = DEFAULT_LOG_PATH,
  spawnImpl = spawn,
} = {}) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath, { flags: 'w' });
  const child = spawnImpl('bun', [SERVER_SCRIPT], {
    cwd: ROOT_DIR,
    detached: process.platform !== 'win32',
    env: {
      ...env,
      E2E_REALTIME_CHANNELS_PORT: getRealtimeChannelsPort(env),
      MEET_REALTIME_TOKEN_SECRET:
        env.MEET_REALTIME_TOKEN_SECRET || LOCAL_E2E_MEET_REALTIME_TOKEN_SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  const exitPromise = new Promise((resolve) => {
    child.once('error', (error) => {
      logStream.end();
      resolve({ error });
    });
    child.once('exit', (code, signal) => {
      logStream.end();
      resolve({ code, signal });
    });
  });

  return registerOwnedRuntime({
    child,
    exitPromise,
    logPath,
    processGroup: process.platform !== 'win32',
    readinessUrl: getRealtimeChannelsReadinessUrl(env),
  });
}

async function waitForRealtimeChannelsFixture(runtime, waitForUrl) {
  const result = await Promise.race([
    waitForUrl(runtime.readinessUrl).then(() => ({ ready: true })),
    runtime.exitPromise.then((exit) => ({ exit })),
  ]);

  if (result.ready) return;

  const detail = result.exit.error
    ? result.exit.error.message
    : `exit=${result.exit.signal ?? result.exit.code ?? 'unknown'}`;
  throw new Error(
    `Realtime channels E2E fixture stopped before it became ready: ${detail}`
  );
}

async function stopRealtimeChannelsFixture(runtime, options = {}) {
  if (!runtime) return;
  if (runtime.child.exitCode != null) {
    if (runtime.processGroup)
      signalOwnedProcess(runtime, 'SIGKILL', options.kill);
    releaseOwnedRuntime(runtime);
    return;
  }

  signalOwnedProcess(runtime, 'SIGTERM', options.kill);
  const exited = await waitForOwnedExit(runtime, options.timeoutMs ?? 5_000);
  if (!exited) {
    signalOwnedProcess(runtime, 'SIGKILL', options.kill);
    await waitForOwnedExit(runtime, 2_000);
  }
  releaseOwnedRuntime(runtime);
}

function printRealtimeChannelsLog(runtime) {
  if (!runtime?.logPath || !fs.existsSync(runtime.logPath)) return;
  const content = fs.readFileSync(runtime.logPath, 'utf8').trim();
  if (!content) return;
  console.error('--- E2E realtime channels fixture log ---');
  console.error(content);
}

module.exports = {
  getRealtimeChannelsPort,
  getRealtimeChannelsPortlessEnv,
  getRealtimeChannelsReadinessUrl,
  printRealtimeChannelsLog,
  startRealtimeChannelsFixture,
  stopRealtimeChannelsFixture,
  waitForRealtimeChannelsFixture,
};
