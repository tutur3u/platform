#!/usr/bin/env bun

const path = require('node:path');
const { spawn } = require('node:child_process');

const WORKSPACE_DIR =
  process.env.PLATFORM_HOST_WORKSPACE_DIR?.trim() || '/workspace';
const RUNNER_SCRIPT_PATH = path.join(
  WORKSPACE_DIR,
  'scripts',
  'watch-web-crons.js'
);
const STATUS_FILE = path.join(
  process.env.PLATFORM_CRON_MONITORING_DIR?.trim() ||
    path.join(WORKSPACE_DIR, 'tmp', 'docker-web', 'cron'),
  'status.json'
);
const RESTART_DELAY_MS = Number.parseInt(
  process.env.PLATFORM_CRON_RUNNER_RESTART_DELAY_MS || '5000',
  10
);
const STATUS_STALE_AFTER_MS = Number.parseInt(
  process.env.PLATFORM_CRON_RUNNER_STATUS_STALE_AFTER_MS || '120000',
  10
);
const STATUS_START_GRACE_MS = Number.parseInt(
  process.env.PLATFORM_CRON_RUNNER_STATUS_START_GRACE_MS || '120000',
  10
);
const WATCHDOG_INTERVAL_MS = Number.parseInt(
  process.env.PLATFORM_CRON_RUNNER_WATCHDOG_INTERVAL_MS || '30000',
  10
);

let activeChild = null;
let stopRequested = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readStatusSnapshot(
  filePath = STATUS_FILE,
  fsImpl = require('node:fs')
) {
  if (!fsImpl.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
  } catch {
    return false;
  }
}

function getStatusSnapshotHealth({
  fsImpl = require('node:fs'),
  now = Date.now(),
  startGraceMs = STATUS_START_GRACE_MS,
  staleAfterMs = STATUS_STALE_AFTER_MS,
  startedAt,
  statusFile = STATUS_FILE,
} = {}) {
  const snapshot = readStatusSnapshot(statusFile, fsImpl);

  if (snapshot === false) {
    return { reason: 'status snapshot invalid', status: 'invalid' };
  }

  if (!snapshot) {
    return now - startedAt <= startGraceMs
      ? { reason: null, status: 'starting' }
      : { reason: 'status snapshot missing', status: 'missing' };
  }

  const updatedAt =
    typeof snapshot.updatedAt === 'number' &&
    Number.isFinite(snapshot.updatedAt)
      ? snapshot.updatedAt
      : null;

  if (updatedAt == null) {
    return { reason: 'status snapshot missing updatedAt', status: 'invalid' };
  }

  const ageMs = Math.max(0, now - updatedAt);

  return ageMs <= staleAfterMs
    ? { ageMs, reason: null, status: 'live' }
    : {
        ageMs,
        reason: `status snapshot stale for ${ageMs}ms`,
        status: 'stale',
      };
}

function shouldRestartForStatusHealth(health) {
  return ['invalid', 'missing', 'stale'].includes(health?.status);
}

async function runOnce() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let restartReason = null;
    const child = spawn(
      'bun',
      [
        RUNNER_SCRIPT_PATH,
        '--interval-ms',
        process.env.PLATFORM_CRON_RUNNER_INTERVAL_MS || '30000',
      ],
      {
        cwd: WORKSPACE_DIR,
        env: process.env,
        stdio: 'inherit',
      }
    );
    activeChild = child;

    const watchdog = setInterval(
      () => {
        const health = getStatusSnapshotHealth({ startedAt });

        if (!shouldRestartForStatusHealth(health)) {
          return;
        }

        restartReason = health.reason;
        console.error(
          `Cron runner heartbeat ${health.reason}; restarting child.`
        );
        child.kill('SIGTERM');
      },
      Number.isFinite(WATCHDOG_INTERVAL_MS) && WATCHDOG_INTERVAL_MS > 0
        ? WATCHDOG_INTERVAL_MS
        : 30000
    );
    watchdog.unref?.();

    child.on('close', (code, signal) => {
      clearInterval(watchdog);
      activeChild = null;
      resolve({ code: code ?? 1, restartReason, signal: signal ?? null });
    });
  });
}

async function main() {
  while (!stopRequested) {
    const result = await runOnce();

    if (stopRequested) {
      return;
    }

    console.error(
      `Cron runner exited with ${result.restartReason ?? result.signal ?? result.code}; restarting.`
    );
    await sleep(
      Number.isFinite(RESTART_DELAY_MS) && RESTART_DELAY_MS > 0
        ? RESTART_DELAY_MS
        : 5000
    );
  }
}

function registerSignalHandlers() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopRequested = true;
      activeChild?.kill(signal);
    });
  }
}

function runHealthcheck() {
  const health = getStatusSnapshotHealth({
    startedAt: Date.now() - STATUS_START_GRACE_MS - 1,
  });

  if (health.status === 'live') {
    return 0;
  }

  console.error(health.reason ?? `status snapshot ${health.status}`);
  return 1;
}

if (require.main === module) {
  registerSignalHandlers();

  if (process.argv.includes('--healthcheck')) {
    process.exit(runHealthcheck());
  }

  void main();
}

module.exports = {
  getStatusSnapshotHealth,
  readStatusSnapshot,
  registerSignalHandlers,
  runHealthcheck,
  shouldRestartForStatusHealth,
};
