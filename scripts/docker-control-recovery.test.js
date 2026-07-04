const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createDockerControlConfig,
  runCronRunnerWatchdogCycle,
} = require('../apps/web/docker/docker-control-recovery.js');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docker-control-recovery-'));
}

function createTestConfig(tempDir, env = {}) {
  return createDockerControlConfig({
    PLATFORM_BLUE_GREEN_MONITORING_DIR: path.join(tempDir, 'runtime'),
    PLATFORM_DOCKER_CONTROL_CRON_RECOVERY_COOLDOWN_MS: '60000',
    PLATFORM_DOCKER_CONTROL_CRON_RUNNER_STALE_AFTER_MS: '120000',
    PLATFORM_DOCKER_CONTROL_CRON_WATCHDOG_INTERVAL_MS: '30000',
    PLATFORM_DOCKER_CONTROL_PORT: '7810',
    PLATFORM_DOCKER_CONTROL_STATUS_FILE: path.join(
      tempDir,
      'docker-control',
      'status.json'
    ),
    PLATFORM_DOCKER_CONTROL_TOKEN: 'test-token',
    PLATFORM_HOST_WORKSPACE_DIR: tempDir,
    ...env,
  });
}

function writeHeartbeat(config, updatedAt) {
  fs.mkdirSync(path.dirname(config.cronStatusFile), { recursive: true });
  fs.writeFileSync(
    config.cronStatusFile,
    JSON.stringify({
      jobs: [],
      runs: [],
      updatedAt,
    })
  );
}

function createComposeRun({
  failUpService = null,
  runnerStatus = 'healthy',
  watcherStatus = 'healthy',
} = {}) {
  const calls = [];
  const run = async (command, args) => {
    calls.push({ args, command });
    const serviceName = args.at(-1);

    if (args.includes('ps')) {
      const status =
        serviceName === 'web-cron-runner' ? runnerStatus : watcherStatus;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: `${JSON.stringify({ Health: status, Service: serviceName })}\n`,
      };
    }

    if (args.includes('up')) {
      if (serviceName === failUpService) {
        return {
          code: 1,
          signal: null,
          stderr: 'compose failed',
          stdout: '',
        };
      }

      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    return { code: 1, signal: null, stderr: 'unexpected command', stdout: '' };
  };

  return { calls, run };
}

function getUpCalls(calls) {
  return calls.filter((call) => call.args.includes('up'));
}

test('cron runner watchdog leaves a healthy runner alone', async () => {
  const tempDir = createTempDir();

  try {
    const config = createTestConfig(tempDir);
    const now = 2_000_000;
    writeHeartbeat(config, now);
    const { calls, run } = createComposeRun();

    const status = await runCronRunnerWatchdogCycle({
      config,
      now,
      run,
    });

    assert.equal(status.status, 'healthy');
    assert.equal(getUpCalls(calls).length, 0);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('cron runner watchdog force-recreates a stale heartbeat', async () => {
  const tempDir = createTempDir();

  try {
    const config = createTestConfig(tempDir);
    const now = 2_000_000;
    writeHeartbeat(config, now - 200_000);
    const recoveries = [];
    const { calls, run } = createComposeRun();

    const status = await runCronRunnerWatchdogCycle({
      config,
      now,
      onRecovery: (recovery) => recoveries.push(recovery),
      run,
      state: {},
    });

    const upCalls = getUpCalls(calls);
    assert.equal(status.status, 'recovered');
    assert.deepEqual(
      upCalls.map((call) => [
        call.args.at(-1),
        call.args.includes('--force-recreate'),
      ]),
      [
        ['web-blue-green-watcher', false],
        ['web-cron-runner', true],
      ]
    );
    assert.deepEqual(
      recoveries.map((recovery) => recovery.status),
      ['running', 'succeeded']
    );
    assert.equal(recoveries.at(-1).source, 'watchdog');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('cron runner watchdog recovers a missing or unhealthy runner', async () => {
  const tempDir = createTempDir();

  try {
    const config = createTestConfig(tempDir);
    const { calls, run } = createComposeRun({ runnerStatus: 'unhealthy' });

    const status = await runCronRunnerWatchdogCycle({
      config,
      now: 2_000_000,
      run,
      state: {},
    });

    assert.equal(status.status, 'recovered');
    assert.equal(status.lastReason, 'Cron runner container is unhealthy.');
    assert.equal(getUpCalls(calls).at(-1).args.at(-1), 'web-cron-runner');
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('cron runner watchdog honors recovery cooldown', async () => {
  const tempDir = createTempDir();

  try {
    const config = createTestConfig(tempDir);
    const now = 2_000_000;
    writeHeartbeat(config, now - 200_000);
    const { calls, run } = createComposeRun();

    const status = await runCronRunnerWatchdogCycle({
      config,
      now,
      run,
      state: {
        lastAttemptAt: now - 10_000,
      },
    });

    assert.equal(status.status, 'cooldown');
    assert.equal(status.cooldownRemainingMs, 50_000);
    assert.equal(getUpCalls(calls).length, 0);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('cron runner watchdog exposes failed compose recovery in status', async () => {
  const tempDir = createTempDir();

  try {
    const config = createTestConfig(tempDir);
    const now = 2_000_000;
    writeHeartbeat(config, now - 200_000);
    const recoveries = [];
    const statuses = [];
    const { run } = createComposeRun({ failUpService: 'web-cron-runner' });

    const status = await runCronRunnerWatchdogCycle({
      config,
      now,
      onRecovery: (recovery) => recoveries.push(recovery),
      onStatus: (nextStatus) => statuses.push(nextStatus),
      run,
      state: {},
    });

    assert.equal(status.status, 'failed');
    assert.match(status.lastError, /web-cron-runner compose command failed/u);
    assert.deepEqual(
      recoveries.map((recovery) => recovery.status),
      ['running', 'failed']
    );
    assert.deepEqual(
      statuses.map((nextStatus) => nextStatus.status),
      ['recovering', 'failed']
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
