#!/usr/bin/env bun

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const WORKSPACE_DIR =
  process.env.PLATFORM_HOST_WORKSPACE_DIR?.trim() || '/workspace';
const WATCH_ARGS_FILE =
  process.env.PLATFORM_BLUE_GREEN_WATCH_ARGS_FILE ??
  path.join(
    WORKSPACE_DIR,
    'tmp',
    'docker-web',
    'watch',
    'blue-green-auto-deploy.args.json'
  );
const RESTART_EXIT_CODE = 75;
const WATCHER_CONTAINER_ENV = 'PLATFORM_BLUE_GREEN_WATCHER_CONTAINER';
const WATCHER_SCRIPT_PATH = path.join(
  WORKSPACE_DIR,
  'scripts',
  'watch-blue-green-deploy.js'
);
const WATCH_STATUS_FILE =
  process.env.PLATFORM_BLUE_GREEN_WATCH_STATUS_FILE ??
  path.join(
    WORKSPACE_DIR,
    'tmp',
    'docker-web',
    'watch',
    'blue-green-auto-deploy.status.json'
  );
const WATCHDOG_INTERVAL_MS = parsePositiveInteger(
  process.env.PLATFORM_BLUE_GREEN_WATCHDOG_INTERVAL_MS,
  15_000
);
const WATCHDOG_START_GRACE_MS = parsePositiveInteger(
  process.env.PLATFORM_BLUE_GREEN_WATCHDOG_START_GRACE_MS,
  120_000
);
const WATCHDOG_STALE_GRACE_MS = parsePositiveInteger(
  process.env.PLATFORM_BLUE_GREEN_WATCHDOG_STALE_GRACE_MS,
  240_000
);
const RESTART_DELAY_MS = parsePositiveInteger(
  process.env.PLATFORM_BLUE_GREEN_WATCHER_RESTART_DELAY_MS,
  5_000
);
const MAX_RESTART_DELAY_MS = parsePositiveInteger(
  process.env.PLATFORM_BLUE_GREEN_WATCHER_MAX_RESTART_DELAY_MS,
  60_000
);
const CLEAN_RUN_RESET_MS = parsePositiveInteger(
  process.env.PLATFORM_BLUE_GREEN_WATCHER_CLEAN_RUN_RESET_MS,
  60_000
);

let activeChild = null;
let stopRequested = false;

function parsePositiveInteger(value, fallback) {
  const parsed =
    typeof value === 'string' && value.trim().length > 0
      ? Number.parseInt(value, 10)
      : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readArgs() {
  if (!fs.existsSync(WATCH_ARGS_FILE)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(WATCH_ARGS_FILE, 'utf8'));
    return Array.isArray(parsed) &&
      parsed.every((value) => typeof value === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

function readStatusSnapshot(statusFile = WATCH_STATUS_FILE, fsImpl = fs) {
  if (!fsImpl.existsSync(statusFile)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fsImpl.readFileSync(statusFile, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function getSnapshotStaleAfterMs(
  snapshot,
  fallbackMs = WATCHDOG_STALE_GRACE_MS
) {
  const intervalMs =
    snapshot && typeof snapshot.intervalMs === 'number'
      ? snapshot.intervalMs
      : null;

  return Math.max((intervalMs ?? 0) * 4, 15_000, fallbackMs);
}

function getStatusSnapshotHealth({
  fsImpl = fs,
  now = Date.now(),
  startGraceMs = WATCHDOG_START_GRACE_MS,
  startedAt,
  staleGraceMs = WATCHDOG_STALE_GRACE_MS,
  statusFile = WATCH_STATUS_FILE,
} = {}) {
  const snapshot = readStatusSnapshot(statusFile, fsImpl);

  if (!snapshot) {
    return now - startedAt > startGraceMs
      ? {
          reason: `status snapshot missing for more than ${startGraceMs}ms`,
          status: 'missing',
        }
      : { reason: null, status: 'starting' };
  }

  const updatedAt =
    typeof snapshot.updatedAt === 'number' &&
    Number.isFinite(snapshot.updatedAt)
      ? snapshot.updatedAt
      : null;

  if (updatedAt == null) {
    return {
      reason: 'status snapshot does not include a valid updatedAt timestamp',
      status: 'invalid',
    };
  }

  const ageMs = now - updatedAt;
  const staleAfterMs = getSnapshotStaleAfterMs(snapshot, staleGraceMs);

  return ageMs > staleAfterMs
    ? {
        reason: `status snapshot stale for ${ageMs}ms`,
        status: 'stale',
      }
    : { reason: null, status: 'live' };
}

function hasOnceArg(args) {
  return args.includes('--once');
}

function shouldRestartWatcherExit(result, args, { stopRequested: stopping }) {
  if (stopping) {
    return false;
  }

  if (result.code === RESTART_EXIT_CODE || result.restartReason) {
    return true;
  }

  if (hasOnceArg(args)) {
    return false;
  }

  return result.code !== 0;
}

function terminateChild(child, reason) {
  if (!child || child.exitCode != null || child.signalCode != null) {
    return null;
  }

  console.error(`${reason}. Restarting watcher child process.`);
  child.kill('SIGTERM');

  return setTimeout(() => {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill('SIGKILL');
    }
  }, 10_000);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runWatcherOnce(args, options = {}) {
  return new Promise((resolve, reject) => {
    const startedAt =
      typeof options.now === 'function' ? options.now() : Date.now();
    let restartReason = null;
    let killTimer = null;
    const child = spawn('bun', [WATCHER_SCRIPT_PATH, ...args], {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        [WATCHER_CONTAINER_ENV]: '1',
      },
      stdio: 'inherit',
    });
    activeChild = child;

    const watchdog = setInterval(() => {
      if (
        stopRequested ||
        restartReason ||
        child.exitCode != null ||
        child.signalCode != null
      ) {
        return;
      }

      const health = getStatusSnapshotHealth({
        now: typeof options.now === 'function' ? options.now() : Date.now(),
        startedAt,
      });

      if (health.status === 'live' || health.status === 'starting') {
        return;
      }

      restartReason = health.reason;
      killTimer = terminateChild(child, health.reason);
    }, WATCHDOG_INTERVAL_MS);

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearInterval(watchdog);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      if (activeChild === child) {
        activeChild = null;
      }
      resolve({
        code: code ?? (signal ? 1 : 0),
        restartReason,
        signal: signal ?? null,
        uptimeMs:
          (typeof options.now === 'function' ? options.now() : Date.now()) -
          startedAt,
      });
    });
  });
}

function installSignalHandlers() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopRequested = true;
      if (
        activeChild &&
        activeChild.exitCode == null &&
        activeChild.signalCode == null
      ) {
        activeChild.kill(signal);
      } else {
        process.exit(0);
      }
    });
  }
}

async function main() {
  installSignalHandlers();
  let restartDelayMs = 0;

  while (true) {
    const args = readArgs();
    const result = await runWatcherOnce(args);

    if (!shouldRestartWatcherExit(result, args, { stopRequested })) {
      process.exit(result.code);
    }

    if (result.code === RESTART_EXIT_CODE) {
      console.info('Watcher requested an in-container restart. Relaunching.');
      restartDelayMs = 0;
      continue;
    }

    if (result.uptimeMs >= CLEAN_RUN_RESET_MS) {
      restartDelayMs = 0;
    }

    const delayMs = restartDelayMs;
    restartDelayMs =
      restartDelayMs === 0
        ? RESTART_DELAY_MS
        : Math.min(restartDelayMs * 2, MAX_RESTART_DELAY_MS);

    const exitLabel = result.signal
      ? `signal ${result.signal}`
      : `code ${result.code}`;
    const reason =
      result.restartReason ??
      `watcher child exited unexpectedly with ${exitLabel}`;

    console.warn(
      delayMs > 0
        ? `${reason}. Relaunching in ${delayMs}ms.`
        : `${reason}. Relaunching now.`
    );

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

module.exports = {
  getSnapshotStaleAfterMs,
  getStatusSnapshotHealth,
  hasOnceArg,
  parsePositiveInteger,
  readStatusSnapshot,
  shouldRestartWatcherExit,
};
